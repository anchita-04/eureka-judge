import os
import uuid

WORKSPACE_ROOT = "workspace"

def create_submission_workspace(source_code: str, input_data: str, language_config: dict) -> str:
    submission_id = str(uuid.uuid4())
    submission_dir = os.path.join(WORKSPACE_ROOT, submission_id)
    os.makedirs(submission_dir, exist_ok=True)

    source_path = os.path.join(submission_dir, language_config["source_filename"])
    with open(source_path, "w") as f:
        f.write(source_code)

    input_path = os.path.join(submission_dir, "input.txt")
    with open(input_path, "w") as f:
        f.write(input_data)

    return submission_dir