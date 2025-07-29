# PowerShell script to copy only necessary files to the clean repository

# Source and destination directories
$sourceDir = "c:\Projects\scope"
$destDir = "c:\Projects\scope_clean"

# Create destination directory if it doesn't exist
if (-not (Test-Path -Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir | Out-Null
}

# Copy all files except those in .gitignore and other large directories
$excludeDirs = @(
    '.git',
    '.venv',
    'node_modules',
    'dist',
    'build',
    'coverage',
    'moshi-main',
    'whisper_integration/__pycache__',
    'whisper_integration/.pytest_cache',
    'whisper_integration/build',
    'whisper_integration/dist',
    'whisper_integration/*.egg-info',
    '**/__pycache__',
    '**/.pytest_cache',
    '**/*.pyc',
    '**/*.pyo',
    '**/*.pyd',
    '**/*.so',
    '**/*.dll',
    '**/*.lib',
    '**/*.pdb',
    '**/*.dylib',
    '**/*.a',
    '**/*.o',
    '**/*.obj',
    '**/*.pt',
    '**/*.bin',
    '**/*.h5',
    '**/*.pth'
)

# Convert exclude patterns to regex
$excludePatterns = $excludeDirs | ForEach-Object { 
    [regex]::Escape($_) -replace '\\\*\\\*', '.*' -replace '\\\*', '[^\\/]*' 
}

# Function to test if path should be excluded
function Should-ExcludePath {
    param([string]$path)
    
    $relativePath = $path.Substring($sourceDir.Length + 1)
    
    foreach ($pattern in $excludePatterns) {
        if ($relativePath -match $pattern) {
            return $true
        }
    }
    
    return $false
}

# Copy files recursively, excluding specified patterns
Get-ChildItem -Path $sourceDir -Recurse -Force | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourceDir.Length + 1)
    $destPath = Join-Path -Path $destDir -ChildPath $relativePath
    
    # Skip if path matches any exclude pattern
    if (Should-ExcludePath -path $_.FullName) {
        Write-Host "Skipping: $relativePath"
        return
    }
    
    # Create directory if it doesn't exist
    if ($_.PSIsContainer) {
        if (-not (Test-Path -Path $destPath)) {
            New-Item -ItemType Directory -Path $destPath -Force | Out-Null
        }
    }
    else {
        # Ensure parent directory exists
        $parentDir = Split-Path -Path $destPath -Parent
        if (-not (Test-Path -Path $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }
        
        # Copy file
        Copy-Item -Path $_.FullName -Destination $destPath -Force
        Write-Host "Copied: $relativePath"
    }
}

Write-Host "\nCopy operation completed successfully!"
