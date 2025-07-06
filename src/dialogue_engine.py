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

    def start_discussion(self, user_prompt):
        #logger.info(f"用户发起话题: {user_prompt}")
        self.history.append(f"用户: {user_prompt}")

        self.current_turn = 1
        while self.current_turn <= self.max_turns:
            #logger.info(f"开始第 {self.current_turn} 轮讨论")
            turn_responses = []

            for model_name, adapter in self.models.items():
                context = self._get_context()
                prompt = f"请基于以下讨论继续发言:\n{context}"

                #logger.info(f"请求 {model_name} 模型...")
                response = adapter.generate(prompt, self.history)
                #logger.info(f"{model_name} 响应: {response[:100]}...")

                # 彩色输出不同模型
                if "DeepSeek" in model_name:
                    formatted = f"\033[1;32m{model_name}:\033[0m {response}"
                elif "Doubao" in model_name:
                    formatted = f"\033[1;35m{model_name}:\033[0m {response}"
                else:
                    formatted = f"\033[1;36m{model_name}:\033[0m {response}"

                print(formatted)
                turn_responses.append(f"{model_name}: {response}")

            self.history.extend(turn_responses)
            self.current_turn += 1

        return self.history
