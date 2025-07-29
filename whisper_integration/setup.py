from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = fh.read().splitlines()

setup(
    name="whisper-integration",
    version="0.1.0",
    author="DawaAssist Team",
    author_email="info@dawaassist.org",
    description="Whisper speech-to-text integration for DawaAssist",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yourusername/dawaassist-whisper",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    include_package_data=True,
    install_requires=requirements,
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
    keywords="whisper speech-to-text asr dawaassist",
)
