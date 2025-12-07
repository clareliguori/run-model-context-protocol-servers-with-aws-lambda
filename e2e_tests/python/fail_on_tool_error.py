import time
from strands.hooks import HookProvider, HookRegistry, AfterToolCallEvent


class FailOnToolError(HookProvider):
    def __init__(self, max_retries: int = 3, retry_delay: float = 1.0):
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    def register_hooks(self, registry: HookRegistry) -> None:
        registry.add_callback(AfterToolCallEvent, self.check_result)

    def check_result(self, event: AfterToolCallEvent) -> None:
        if event.result.get("isError", False):
            for attempt in range(self.max_retries):
                time.sleep(self.retry_delay)
                try:
                    # Retry the tool execution
                    result = event.selected_tool(event.tool_use, event.invocation_state)
                    if not result.get("isError", False):
                        event.result = result
                        return
                except Exception:
                    continue
            
            # All retries failed
            error_content = event.result.get("content", [{}])[0].get("text", "Unknown error")
            raise RuntimeError(f"Tool {event.tool_use['name']} failed after {self.max_retries} retries: {error_content}")
