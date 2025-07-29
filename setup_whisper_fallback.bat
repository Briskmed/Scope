@echo off
echo Setting up Whisper fallback dependencies...

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python is not installed or not in PATH. Please install Python 3.8 or later from https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Create a virtual environment
echo Creating Python virtual environment...
python -m venv .venv
call .venv\Scripts\activate.bat

:: Install required packages
echo Installing required Python packages...
pip install -U pip
pip install -r whisper_integration\requirements.txt

:: Install PyTorch with CUDA support if available
pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

:: Install whisper_integration in development mode
cd whisper_integration
pip install -e .
cd ..

echo.
echo Whisper fallback setup complete!
echo You can now use the whisper_integration as a fallback when the Groq API is unavailable.
pause
