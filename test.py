from pathlib import Path
import os

from judge import run_judge

case_dir = Path(__file__).resolve().parent / "workspace" / "testcase1"

language = (case_dir / "language.txt").read_text().strip().lower()
source_code = (case_dir / "source.txt").read_text()
input_data = (case_dir / "input.txt").read_text()
expected_output = (case_dir / "output.txt").read_text()

result = run_judge(
    source_code=source_code,
    language=language,
    input_data=input_data,
    expected_output=expected_output,
    submission_id=os.getenv("EUREKA_SUBMISSION_ID") or None,
)
print(result)
if result.get("callback", {}).get("reported") is False:
    raise SystemExit(1)
