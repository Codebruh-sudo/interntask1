
Branch: abhi-task1-final Author: ABHI — Code Deployers Intern

🛠️ What This Is
This project is a Strapi backend tailored for local development and content modeling. Built as part of Internship Task 1, it includes customized content types, schema structure, and onboarding scaffolding to support future use and extension.

🌱 Features Delivered
Modular backend with custom content types

File upload and JSON output enabled

.env.example for safe environment setup

Clean folder structure for easy onboarding

Repo hygiene: all work committed via abhi-task1-final

📂 Project Layout
plaintext
interntask1/
└── strapi/
    ├── config/          # Strapi config files
    ├── src/             # API schemas & components
    ├── public/          # Static assets
    ├── .env.example     # Environment variables template
    └── README.md        # This file
⚙️ How to Run Locally
bash
# Clone the repo
git clone https://github.com/Codebruh-sudo/interntask1.git
cd interntask1/strapi

# Install dependencies
yarn install

# Set up your environment
cp .env.example .env

# Start the server
yarn develop
Visit: http://localhost:1337/admin

🤝 Collaboration Notes
All changes tracked in abhi-task1-final

No direct pushes to main

Structure prepared for containerization (Task 2)

Ready for future linting, CI, and security scans
