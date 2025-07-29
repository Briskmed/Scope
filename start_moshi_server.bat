@echo off
call .venv\Scripts\activate
cd moshi-main\moshi
set PYTHONPATH=.
python -m moshi.server --host 0.0.0.0 --port 8998
