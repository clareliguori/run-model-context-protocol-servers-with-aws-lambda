import logging
import time
from strands.hooks import HookProvider, HookRegistry, AfterToolCallEvent

logger = logging.getLogger(__name__)


class FailOnToolError(HookProvider):
    def __init__(self, max_retries: int = 3, retry_delay: float = 1.0):
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def register_hooks(self, registry: HookRegistry) -> None:
        registry.add_callback(AfterToolCallEvent, self.check_result)

    def check_result(self, event: AfterToolCallEvent) -> None:
        if event.result.get("isError", False):
            tool_name = event.tool_use["name"]
            error_content = event.result.get("content", [{}])[0].get("text", "Unknown error")
            logger.warning(f"Tool {tool_name} failed: {error_content}")

            for attempt in range(self.max_retries):
                logger.info(f"Retrying tool {tool_name} (attempt {attempt + 1}/{self.max_retries})")
                time.sleep(self.retry_delay)
                try:
                    result = event.selected_tool(event.tool_use, event.invocation_state)
                    if not result.get("isError", False):
                        logger.info(f"Tool {tool_name} succeeded on retry {attempt + 1}")
                        event.result = result
                        return
                except Exception as e:
                    logger.warning(f"Retry {attempt + 1} failed: {e}")
                    continue

            raise RuntimeError(f"Tool {tool_name} failed after {self.max_retries} retries: {error_content}")
