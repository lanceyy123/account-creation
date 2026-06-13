import os

# Ask user for txt file path
input_file = input("Enter txt file path: ").strip().strip('"')

# Check if file exists
if not os.path.exists(input_file):
    print("File not found!")
    exit()

# Create output file in same folder
output_file = os.path.join(
    os.path.dirname(input_file),
    "usernames_only.txt"
)

usernames = []

with open(input_file, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()

        if not line:
            continue

        # Get username before first |
        username = line.split(",")[0].strip()

        usernames.append(username)

# Remove duplicates while keeping order
unique_usernames = list(dict.fromkeys(usernames))

# Save result
with open(output_file, "w", encoding="utf-8") as f:
    for username in unique_usernames:
        f.write(username + "\n")

print(f"\nDone!")
print(f"Saved to: {output_file}")