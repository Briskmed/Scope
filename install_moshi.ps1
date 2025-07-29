# Activate the virtual environment
. \.venv\Scripts\Activate.ps1

# Navigate to the moshi directory
Set-Location moshi-main\moshi-main

# Install in development mode
pip install -e .

# Check if moshi is installed
pip list | findstr moshi

# Try to import moshi to verify installation
python -c "import moshi; print('Moshi is installed at:', moshi.__file__)"

# Go back to the project root
Set-Location ..\..

Write-Host "Moshi installation complete. You can now start the server with: start_moshi_server.bat" -ForegroundColor Green
