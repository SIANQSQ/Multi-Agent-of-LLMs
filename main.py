from dialogue_engine import DialogueEngine
from colorama import init, Fore
import argparse

init(autoreset=True)


def main():
    print(Fore.CYAN + "=" * 60)
    print(Fore.YELLOW + "多模型对话系统 - DeepSeek | 豆包 | 文心一言")
    print(Fore.CYAN + "=" * 60)

    # 添加命令行参数解析
    parser = argparse.ArgumentParser(description='多模型对话系统')
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--topic', type=str, help='直接指定讨论主题')
    args = parser.parse_args()

    engine = DialogueEngine()

    try:
        while True:
            if args.topic:
                topic = args.topic
                args.topic = None  # 只使用一次
            else:
                topic = input("\n请输入讨论主题 (输入q退出): ")
                if topic.lower() in ['q', 'quit', 'exit']:
                    print(Fore.GREEN + "\n感谢使用，再见！")
                    break

                if not topic.strip():
                    print(Fore.RED + "错误：主题不能为空")
                    continue

            history = engine.start_discussion(topic)

            print(Fore.CYAN + "\n" + "=" * 60)
            print(Fore.YELLOW + "完整讨论记录:")
            for i, entry in enumerate(history):
                print(f"{i + 1}. {entry}")
            print(Fore.CYAN + "=" * 60)

            if args.debug:  # 调试模式下只运行一次
                break

    except KeyboardInterrupt:
        print(Fore.RED + "\n操作已中断")
    except Exception as e:
        print(Fore.RED + f"发生错误: {str(e)}")


if __name__ == "__main__":
    main()