@echo off
echo Setting up Moshi...

:: Create and activate virtual environment
python -m venv .venv
call .venv\Scripts\activate

:: Install PyTorch with CUDA support (if available)
python -m pip install --upgrade pip
pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

:: Navigate to the moshi directory
cd moshi-main\moshi

:: Install Moshi and its dependencies
pip install -r requirements.txt
pip install -e .

:: Install additional dependencies for the server
pip install aiohttp

cd ..\..

echo Moshi setup complete!
echo.
echo To start the Moshi server, run:
echo   start_moshi_server.bat
