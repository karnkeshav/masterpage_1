import urllib.request
import time

try:
    urllib.request.urlopen("http://localhost:8080/app/consoles/student.html", timeout=3)
    print("Local server running successfully")
except Exception as e:
    print(f"Error connecting: {e}")
