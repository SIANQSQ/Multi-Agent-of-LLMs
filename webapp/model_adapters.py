import openai
import requests
import json
import time
import random


class BaseModelAdapter:
    def __init__(self, config):
        self.config = config
        self.last_call_time = 0

    def _rate_limit(self):
        """API调用速率限制"""
        current_time = time.time()
        if current_time - self.last_call_time < 1.0:  # 1秒间隔
            time.sleep(1.0 - (current_time - self.last_call_time))
        self.last_call_time = time.time()

    def generate(self, prompt, history):
        raise NotImplementedError

    def _get_mock_response(self, model_name):
        """生成模拟响应，用于演示"""
        responses = {
            "DeepSeek": [
                "从技术角度分析，这个话题确实值得深入探讨。我认为需要考虑多个维度的影响因素。",
                "基于当前发展趋势，建议采用更系统性的方法来分析这个问题。",
                "这是个有趣的观点，让我从另一个角度补充一些想法。",
                "我同意前面的分析，同时想强调实践中可能遇到的挑战。",
                "综合各种因素，我认为这个方向可行，但需要注意关键点。"
            ],
            "Doubao": [
                "这个话题真的很有意思！我觉得可以从用户体验角度思考。",
                "我赞同刚才的观点，想补充一些关于创新性的思考。",
                "从实用性角度说，需要平衡理想与现实的差距。",
                "这让我想到相关案例，或许能提供启发。",
                "总的来说，这个想法很有潜力，值得进一步探索。"
            ],
            "Wenxin": [
                "从传统智慧角度看，这个问题有深层的思考价值。",
                "应该结合历史经验和现代理念来综合分析。",
                "这确实是复杂问题，需要辩证思维来看待。",
                "想从文化和社会影响层面分享一些见解。",
                "经过思考，这个方向既有机遇也有挑战。"
            ]
        }

        model_responses = responses.get(model_name, responses["DeepSeek"])
        return random.choice(model_responses)


class DeepSeekAdapter(BaseModelAdapter):
    def generate(self, prompt, history):
        self._rate_limit()

        # 检查API密钥配置
        if not self.config.get('api_key') or self.config['api_key'] == 'your_deepseek_api_key_here':
            print("[INFO] DeepSeek API密钥未配置，使用模拟响应")
            return self._get_mock_response("DeepSeek")

        try:
            openai.api_key = self.config['api_key']
            openai.api_base = self.config['api_base']

            # 构建消息
            messages = []
            for msg in history[-5:]:  # 只取最近5条历史
                if ": " in msg:
                    role, content = msg.split(": ", 1)
                    messages.append({
                        "role": "assistant" if role in ["DeepSeek", "Doubao", "Wenxin"] else "user",
                        "content": content
                    })

            messages.append({"role": "user", "content": prompt})

            response = openai.ChatCompletion.create(
                model=self.config['model'],
                messages=messages,
                temperature=self.config.get('temperature', 0.7),
                max_tokens=200
            )
            return response['choices'][0]['message']['content'].strip()

        except Exception as e:
            print(f"[ERROR] DeepSeek API调用失败: {str(e)}")
            return self._get_mock_response("DeepSeek")


class DoubaoAdapter(BaseModelAdapter):
    def generate(self, prompt, history):
        self._rate_limit()

        # 检查API密钥配置
        if not self.config.get('api_key') or self.config['api_key'] == 'your_doubao_api_key_here':
            print("[INFO] 豆包API密钥未配置，使用模拟响应")
            return self._get_mock_response("Doubao")

        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config['api_key']}"
            }

            # 构建消息
            messages = []
            for msg in history[-5:]:  # 只取最近5条历史
                if ": " in msg:
                    role, content = msg.split(": ", 1)
                    messages.append({
                        "role": "assistant" if role in ["DeepSeek", "Doubao", "Wenxin"] else "user",
                        "content": content
                    })

            messages.append({"role": "user", "content": prompt})

            data = {
                "model": self.config['model'],
                "messages": messages,
                "temperature": self.config.get('temperature', 0.7),
                "max_tokens": 200
            }

            response = requests.post(
                f"{self.config['api_base']}/chat/completions",
                headers=headers,
                json=data,
                timeout=30
            )

            if response.status_code == 200:
                response_data = response.json()
                return response_data['choices'][0]['message']['content'].strip()
            else:
                raise Exception(f"API返回错误: {response.status_code}")

        except Exception as e:
            print(f"[ERROR] 豆包API调用失败: {str(e)}")
            return self._get_mock_response("Doubao")


class WenxinAdapter(BaseModelAdapter):
    def generate(self, prompt, history):
        self._rate_limit()

        # 检查API密钥配置
        if not self.config.get('api_key') or self.config['api_key'] == 'your_wenxin_api_key_here':
            print("[INFO] 文心一言API密钥未配置，使用模拟响应")
            return self._get_mock_response("Wenxin")

        try:
            openai.api_key = self.config['api_key']
            openai.api_base = self.config['api_base']

            # 构建消息
            messages = []
            for msg in history[-5:]:  # 只取最近5条历史
                if ": " in msg:
                    role, content = msg.split(": ", 1)
                    messages.append({
                        "role": "assistant" if role in ["DeepSeek", "Doubao", "Wenxin"] else "user",
                        "content": content
                    })

            messages.append({"role": "user", "content": prompt})

            response = openai.ChatCompletion.create(
                model=self.config['model'],
                messages=messages,
                temperature=self.config.get('temperature', 0.7),
                max_tokens=200
            )
            return response['choices'][0]['message']['content'].strip()

        except Exception as e:
            print(f"[ERROR] 文心一言API调用失败: {str(e)}")
            return self._get_mock_response("Wenxin")