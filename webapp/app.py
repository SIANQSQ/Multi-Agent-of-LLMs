from flask import Flask, render_template, request, jsonify
from dialogue_engine import DialogueEngine
import uuid
import time
from datetime import timedelta

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = 'your_very_strong_secret_key_here'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=1)

# 会话存储
sessions = {}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/health')
def health_check():
    """健康检查接口"""
    return jsonify({"status": "ok", "timestamp": time.time()})


@app.route('/keepalive', methods=['POST'])
def keep_alive():
    """会话保活接口"""
    try:
        data = request.json
        session_id = data.get('session_id')

        if session_id and session_id in sessions:
            sessions[session_id]['last_active'] = time.time()
            return jsonify({"status": "ok", "message": "会话已更新"})
        else:
            return jsonify({"error": "会话不存在"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/start', methods=['POST'])
def start_discussion():
    try:
        data = request.json
        topic = data.get('topic', '').strip()
        max_turns = data.get('max_turns', 5)

        print(f"[DEBUG] 收到启动请求，主题: '{topic}'")
        print(f"[DEBUG] 最大轮次: {max_turns}")

        if not topic:
            return jsonify({"error": "主题不能为空"}), 400

        if not isinstance(max_turns, int) or max_turns < 1 or max_turns > 10:
            return jsonify({"error": "讨论轮数必须在1-10之间"}), 400

        # 创建新会话
        session_id = str(uuid.uuid4())
        engine = DialogueEngine()

        # 设置自定义轮次
        engine.max_turns = max_turns
        engine.start_session(topic)

        sessions[session_id] = {
            'engine': engine,
            'topic': topic,
            'created_at': time.time(),
            'last_active': time.time(),
            'current_model_index': 0  # 当前模型索引
        }

        print(f"[DEBUG] 会话创建成功，ID: {session_id}")
        print(f"[DEBUG] 可用模型: {list(engine.models.keys())}")
        print(f"[DEBUG] 最大轮次: {engine.max_turns}")

        return jsonify({
            "session_id": session_id,
            "models": list(engine.models.keys()),
            "max_turns": engine.max_turns,
            "topic": topic
        })

    except Exception as e:
        print(f"[ERROR] 启动讨论失败: {str(e)}")
        return jsonify({"error": f"启动失败: {str(e)}"}), 500


@app.route('/next', methods=['POST'])
def next_response():
    try:
        data = request.json
        session_id = data.get('session_id')

        print(f"[DEBUG] 收到响应请求，会话ID: {session_id}")

        if not session_id or session_id not in sessions:
            print(f"[ERROR] 无效的会话ID: {session_id}")
            return jsonify({"error": "会话不存在或已过期"}), 404

        session_data = sessions[session_id]
        # 更新会话活跃时间
        session_data['last_active'] = time.time()

        engine = session_data['engine']
        model_names = list(engine.models.keys())

        # 获取当前模型索引
        current_model_index = session_data['current_model_index']

        # 检查是否完成所有模型的当前轮次
        if current_model_index >= len(model_names):
            engine.current_turn += 1
            current_model_index = 0
            session_data['current_model_index'] = 0

            print(f"[DEBUG] 进入第 {engine.current_turn} 轮")

            # 检查是否达到最大轮次
            if engine.current_turn > engine.max_turns:
                print(f"[DEBUG] 讨论完成，共 {engine.max_turns} 轮")
                sessions.pop(session_id, None)
                return jsonify({"done": True, "message": "讨论完成"})

        # 获取当前模型
        model_name = model_names[current_model_index]
        adapter = engine.models[model_name]

        print(f"[DEBUG] 当前模型: {model_name} (索引: {current_model_index})")
        print(f"[DEBUG] 当前轮次: {engine.current_turn}/{engine.max_turns}")

        # 生成响应
        context = engine._get_context()
        prompt = f"请基于以下讨论继续发言，保持简洁有意义的回复:\n{context}"

        print(f"[DEBUG] 调用 {model_name} 生成响应...")

        response = adapter.generate(prompt, engine.history)

        print(f"[DEBUG] {model_name} 响应: {response[:100]}...")

        # 更新历史记录
        response_entry = f"{model_name}: {response}"
        engine.history.append(response_entry)

        # 更新会话状态
        session_data['current_model_index'] = current_model_index + 1

        # 确保轮次从1开始显示
        display_turn = engine.current_turn if engine.current_turn > 0 else 1

        return jsonify({
            "model": model_name,
            "response": response,
            "turn": display_turn,
            "total_turns": engine.max_turns,
            "done": False,
            "timestamp": time.time()
        })

    except Exception as e:
        print(f"[ERROR] 生成响应失败: {str(e)}")
        return jsonify({"error": f"生成响应失败: {str(e)}"}), 500


# 清理过期会话
def cleanup_sessions():
    now = time.time()
    expired_sessions = [
        sid for sid, data in sessions.items()
        if now - data['last_active'] > 7200  # 2小时过期
    ]
    for sid in expired_sessions:
        sessions.pop(sid, None)
        print(f"[DEBUG] 清理过期会话: {sid}")


# 定时清理
from threading import Timer


def schedule_cleanup():
    cleanup_sessions()
    Timer(600, schedule_cleanup).start()  # 每10分钟清理一次


schedule_cleanup()

if __name__ == '__main__':
    print("[INFO] 启动多模型对话系统...")
    print("[INFO] 访问地址: http://localhost:5000")
    app.run(debug=True, port=5000, host='0.0.0.0')