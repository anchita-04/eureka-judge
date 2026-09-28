import json
import os
import shutil
from typing import Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from languages import get_language_config
from manage import create_submission_workspace
from docker_runner import run_in_container


def report_verdict(
    submission_id: str,
    verdict: str,
    runtime_ms: Optional[int],
    api_base_url: str,
    judge_event_secret: str,
) -> dict:
    url = f"{api_base_url.rstrip('/')}/internal/submissions/{submission_id}/verdict"
    body = json.dumps({"verdict": verdict, "runtimeMs": runtime_ms}).encode("utf-8")
    request = Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Judge-Secret": judge_event_secret,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            response.read()
        return {"reported": True}
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        return {"reported": False, "error": f"API returned HTTP {error.code}: {details}"}
    except (URLError, TimeoutError, OSError) as error:
        return {"reported": False, "error": str(error)}


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
    submission_id: str | None = None,
    api_base_url: str | None = None,
    judge_event_secret: str | None = None,
) -> dict:
    config = get_language_config(language)
    workspace = create_submission_workspace(source_code, input_data, config)

    try:
        compile_result = compile_submission(workspace, config)
        if compile_result["verdict"] != "OK":
            result = {"verdict": compile_result["verdict"], "detail": compile_result["stderr"]}
            runtime_ms = None
        else:
            exec_result = execute_submission(
                workspace, config, input_data, time_limit_seconds, memory_limit_mb
            )
            runtime_ms = exec_result.get("runtime_ms")
            if exec_result["verdict"] != "OK":
                result = {"verdict": exec_result["verdict"], "detail": exec_result["stderr"]}
            elif compare_output(exec_result["stdout"], expected_output):
                result = {"verdict": "AC", "detail": ""}
            else:
                result = {
                    "verdict": "WA",
                    "detail": f"Expected: {expected_output!r}, Got: {exec_result['stdout']!r}",
                }
    finally:
        # Always clean up the temp workspace, even if something above raised.
        shutil.rmtree(workspace, ignore_errors=True)

    if submission_id:
        api_base_url = api_base_url or os.getenv("EUREKA_API_BASE_URL", "http://localhost:3000/api")
        judge_event_secret = judge_event_secret or os.getenv("JUDGE_EVENT_SECRET", "")
        if not judge_event_secret:
            result["callback"] = {
                "reported": False,
                "error": "Set JUDGE_EVENT_SECRET before reporting this submission",
            }
        else:
            result["callback"] = report_verdict(
                submission_id, result["verdict"], runtime_ms, api_base_url, judge_event_secret
            )
        if not result["callback"]["reported"]:
            result["detail"] = (
                f"{result['detail']}\nVerdict callback failed: {result['callback']['error']}"
            ).strip()

    return result
