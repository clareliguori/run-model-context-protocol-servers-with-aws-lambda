from strands_evals.evaluators import Evaluator
from strands_evals.types.evaluation import EvaluationData, EvaluationOutput
from typing_extensions import TypeVar

InputT = TypeVar("InputT")
OutputT = TypeVar("OutputT")


class ToolCallEvaluator(Evaluator[InputT, OutputT]):
    """Evaluates if expected tools were called successfully."""

    def __init__(self, expected_tools: list[str]):
        super().__init__()
        self.expected_tools = expected_tools

    def evaluate(self, evaluation_case: EvaluationData[InputT, OutputT]) -> list[EvaluationOutput]:
        if not evaluation_case.actual_trajectory:
            return [EvaluationOutput(
                score=0.0,
                test_pass=False,
                reason="No trajectory data available"
            )]

        tool_successes = set()
        tool_errors = []

        for event in evaluation_case.actual_trajectory:
            if isinstance(event, dict) and 'name' in event:
                if event.get('is_error', False):
                    tool_errors.append(event['name'])
                else:
                    tool_successes.add(event['name'])

        missing_tools = [t for t in self.expected_tools if t not in tool_successes]
        score = len([t for t in self.expected_tools if t in tool_successes]) / len(self.expected_tools) if self.expected_tools else 1.0
        test_pass = len(missing_tools) == 0

        if test_pass:
            reason = f"All expected tools called successfully: {self.expected_tools}"
        else:
            reason = f"Missing successful calls: {missing_tools}"

        if tool_errors:
            reason += f" (tool errors logged: {tool_errors})"

        return [EvaluationOutput(score=score, test_pass=test_pass, reason=reason)]

    async def evaluate_async(self, evaluation_case: EvaluationData[InputT, OutputT]) -> list[EvaluationOutput]:
        return self.evaluate(evaluation_case)
