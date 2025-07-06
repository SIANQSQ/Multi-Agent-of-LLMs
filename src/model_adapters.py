import openai
import requests
import json
import time
from qianfan import ChatCompletion


class BaseModelAdapter:
    def __init__(self, config):
        self.config = config
        self.last_call_time = 0

    def _rate_limit(self):
        """API调用速率限制"""
        current_time = time.time()
        if current_time - self.last_call_time < 1.5:  # 1.5秒间隔
            time.sleep(1.5 - (current_time - self.last_call_time))
        self.last_call_time = time.time()

    def generate(self, prompt, history):
        raise NotImplementedError


class DeepSeekAdapter(BaseModelAdapter):
    def generate(self, prompt, history):
        self._rate_limit()
        try:
            openai.api_key = self.config['api_key']
            openai.api_base = self.config['api_base']

            messages = [{"role": "user", "content": msg} for msg in history]
            messages.append({"role": "user", "content": prompt})

            response = openai.ChatCompletion.create(
                model=self.config['model'],
                messages=messages,
                temperature=self.config.get('temperature', 0.7)
            )
            return response['choices'][0]['message']['content'].strip()
        except Exception as e:
            return f"[DeepSeek Error] {str(e)}"


class DoubaoAdapter(BaseModelAdapter):
    def generate(self, prompt, history):
        self._rate_limit()
        try:
            # 更新为豆包官方API格式
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.config['api_key']}"
            }

            # 构建符合豆包API的消息格式
            messages = []
            for msg in history:
                if ": " in msg:
                    role, content = msg.split(": ", 1)
                    messages.append({
                        "role": "user" if role == "用户" else "assistant",
                        "content": content
                    })

            messages.append({"role": "user", "content": prompt})

            data = {
                "model": self.config['model'],
                "messages": messages,
                "temperature": self.config.get('temperature', 0.7)
            }

            # 使用正确的豆包API端点
            response = requests.post(
                f"{self.config['api_base']}/chat/completions",
                headers=headers,
                json=data,
                timeout=30
            )

            # 调试输出
            #print(f"豆包响应状态码: {response.status_code}")
            #print(f"豆包响应内容: {response.text[:200]}...")

            response_data = response.json()
            return response_data['choices'][0]['message']['content'].strip()
        except Exception as e:
            return f"[Doubao Error] {str(e)}"


class WenxinAdapter(BaseModelAdapter):
    def generate(self, prompt, history):
        self._rate_limit()
        try:
            openai.api_key = self.config['api_key']
            openai.api_base = self.config['api_base']

            messages = [{"role": "user", "content": msg} for msg in history]
            messages.append({"role": "user", "content": prompt})

            response = openai.ChatCompletion.create(
                model=self.config['model'],
                messages=messages,
                temperature=self.config.get('temperature', 0.7)
            )
            return response['choices'][0]['message']['content'].strip()
        except Exception as e:
            return f"[Wenxin Error] {str(e)}"
