import yaml
import time
import logging
from model_adapters import DeepSeekAdapter, DoubaoAdapter, WenxinAdapter

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("DialogueEngine")


class DialogueEngine:
    def __init__(self, config_path="config.yaml"):
        try:
            with open(config_path) as f:
                self.config = yaml.safe_load(f)

            self.models = {
                "DeepSeek": DeepSeekAdapter(self.config['model_configs']['deepseek']),
                "Doubao": DoubaoAdapter(self.config['model_configs']['doubao']),
                "Wenxin": WenxinAdapter(self.config['model_configs']['wenxin'])
            }

            self.history = []
            self.current_turn = 0
            self.max_turns = self.config['system']['max_turns']
            self.context_window = self.config['system']['context_window']

            logger.info("对话引擎初始化完成")
            logger.info(f"最大对话轮次: {self.max_turns}")
            logger.info(f"上下文窗口大小: {self.context_window}")

        except Exception as e:
            logger.error(f"初始化失败: {str(e)}")
            raise

    def _get_context(self):
        """获取最近的上下文"""
        return "\n".join(self.history[-self.context_window:])

    def start_session(self, topic):
        """开始新会话"""
        self.history = []
        self.current_turn = 0
        self.history.append(f"用户: {topic}")
        return self.history

    def generate_responses(self):
        """生成一轮模型响应"""
        if self.current_turn >= self.max_turns:
            return [], True

        responses = []
        self.current_turn += 1

        for model_name, adapter in self.models.items():
            context = self._get_context()
            prompt = f"请基于以下讨论继续发言:\n{context}"

            response = adapter.generate(prompt, self.history)
            response_entry = f"{model_name}: {response}"
            responses.append({
                "model": model_name,
                "response": response,
                "entry": response_entry
            })

        # 更新历史记录
        for resp in responses:
            self.history.append(resp['entry'])

        # 检查是否结束
        done = self.current_turn >= self.max_turns

        return responses, done