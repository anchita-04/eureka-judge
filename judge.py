import shutil
from languages import get_language_config
from manage import create_submission_workspace
from docker_runner import run_in_container


def compile_submission(submission_dir: str, language_config: dict) -> dict:
    if language_config["compile_cmd"] is None:
        return {"verdict": "OK", "stdout": "", "stderr": ""}

    result = run_in_container(
        submission_dir,
        language_config["compile_cmd"],
        timeout_seconds=10,
        memory_limit_mb=512,   # compilers need more headroom than typical solution runs
    )

    # Any non-OK outcome during compilation is reported as CE, regardless of
    # whether the underlying cause was a timeout, OOM, or a normal compile error.
    if result["verdict"] != "OK":
        result["verdict"] = "CE"
    return result


def execute_submission(
    submission_dir: str,
    language_config: dict,
    input_data: str,
    time_limit_seconds: int = 2,
    memory_limit_mb: int = 256,
) -> dict:
    return run_in_container(
        submission_dir,
        language_config["run_cmd"],
        stdin_data=input_data,
        timeout_seconds=time_limit_seconds,
        memory_limit_mb=memory_limit_mb,
    )


def compare_output(actual: str, expected: str) -> bool:
    # Trim trailing whitespace/newlines the way real judges do, so a stray
    # trailing newline doesn't fail an otherwise-correct submission.
    return actual.strip() == expected.strip()


def run_judge(
    source_code: str,
    language: str,
    input_data: str,
    expected_output: str,
    time_limit_seconds: int = 2,
    memory_limit_mb: int = 256,
) -> dict:
    config = get_language_config(language)
    workspace = create_submission_workspace(source_code, input_data, config)

    try:
        compile_result = compile_submission(workspace, config)
        if compile_result["verdict"] != "OK":
            return {"verdict": compile_result["verdict"], "detail": compile_result["stderr"]}

        exec_result = execute_submission(
            workspace, config, input_data, time_limit_seconds, memory_limit_mb
        )
        if exec_result["verdict"] != "OK":
            return {"verdict": exec_result["verdict"], "detail": exec_result["stderr"]}

        if compare_output(exec_result["stdout"], expected_output):
            return {"verdict": "AC", "detail": ""}

        return {
            "verdict": "WA",
            "detail": f"Expected: {expected_output!r}, Got: {exec_result['stdout']!r}",
        }
    finally:
        # Always clean up the temp workspace, even if something above raised.
        shutil.rmtree(workspace, ignore_errors=True)