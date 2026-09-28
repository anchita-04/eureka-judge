import subprocess
import os
import uuid
import time

IMAGE_NAME = "judge-sandbox:latest"

def run_in_container(
    submission_dir: str,
    command: list,
    stdin_data: str = "",
    timeout_seconds: int = 10,
    memory_limit_mb: int = 256,
    cpus: float = 1.0,
) -> dict:
    abs_path = os.path.abspath(submission_dir)
    container_name = f"judge-{uuid.uuid4().hex[:12]}"

    docker_cmd = [
        "docker", "run", "--rm",
        "--name", container_name,
        "-i",
        "-v", f"{abs_path}:/box",
        "-w", "/box",
        f"--memory={memory_limit_mb}m",
        f"--memory-swap={memory_limit_mb}m",   # no extra swap beyond the hard limit
        f"--cpus={cpus}",
        "--pids-limit=64",                      # blocks fork-bomb style submissions
        "--network=none",                       # no internet access from inside
        IMAGE_NAME,
    ] + command

    started_at = time.monotonic()
    try:
        result = subprocess.run(
            docker_cmd,
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        # subprocess.run's timeout kills the `docker run` CLI process, but the
        # container can keep running on the Docker daemon -- stop it explicitly.
        subprocess.run(["docker", "stop", "-t", "0", container_name], capture_output=True)
        return {
            "verdict": "TLE",
            "stdout": "",
            "stderr": "",
            "exit_code": None,
            "runtime_ms": int((time.monotonic() - started_at) * 1000),
        }

    # Linux OOM-killer / cgroup memory cap kills the process with SIGKILL,
    # which Docker reports as exit code 137 (128 + signal 9).
    if result.returncode == 137:
        return {
            "verdict": "MLE",
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": 137,
            "runtime_ms": int((time.monotonic() - started_at) * 1000),
        }

    return {
        "verdict": "OK" if result.returncode == 0 else "RE",
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.returncode,
        "runtime_ms": int((time.monotonic() - started_at) * 1000),
    }
