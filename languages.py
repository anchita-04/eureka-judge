LANGUAGES = {
    "cpp": {
        "source_filename": "main.cpp",
        "compile_cmd": ["g++", "main.cpp", "-o", "main", "-O2"],
        "run_cmd": ["./main"],
    },
    "python": {
        "source_filename": "main.py",
        "compile_cmd": None,
        "run_cmd": ["python3", "main.py"],
    },
    "java": {
        "source_filename": "Main.java",
        "compile_cmd": ["javac", "Main.java"],
        "run_cmd": ["java", "Main"],
    },
}

def get_language_config(language: str) -> dict:
    if language not in LANGUAGES:
        raise ValueError(f"Unsupported language: {language}")
    return LANGUAGES[language]