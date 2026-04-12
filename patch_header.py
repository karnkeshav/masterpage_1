import re

with open("app/consoles/teacher.html", "r") as f:
    content = f.read()

# Replace header classes
content = content.replace('<header class="glass-panel sticky top-0 z-40 bg-cbse-blue shadow-lg py-3 px-6 flex justify-between items-center text-white border-b border-white/10">', '<header class="glass-panel sticky top-0 z-40 bg-cbse-blue shadow-lg py-3 px-6 grid grid-cols-3 items-center text-white border-b border-white/10 console-header-grid">')

# Replace Left section classes
content = content.replace('<div class="flex items-center space-x-4">', '<div class="flex items-center space-x-4 justify-self-start">', 1)

# Replace Middle section classes
content = content.replace('<div class="flex gap-4 items-center bg-cbse-blue/50 border border-white/10 rounded-xl px-4 py-2">', '<div class="flex gap-4 items-center bg-cbse-blue/50 border border-white/10 rounded-xl px-4 py-2 justify-self-center">')

# Replace Right section classes
content = content.replace('<div class="flex items-center space-x-3">', '<div class="flex items-center space-x-3 justify-self-end">')

# Remove mr-4
content = content.replace('<div class="hidden md:flex flex-col items-end mr-4">', '<div class="hidden md:flex flex-col items-end">')


with open("app/consoles/teacher.html", "w") as f:
    f.write(content)
