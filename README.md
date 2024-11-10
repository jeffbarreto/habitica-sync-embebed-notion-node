# Habitica & Notion Sync Integration
This project allows seamless synchronization between tasks in Habitica and Notion using Node.js. With this, you can keep your tasks aligned across both platforms, with automated updates using cron jobs.

## Prerequisites
To run this project, make sure you have:

- Node.js installed
- A Notion database with an API integration and token
- A Habitica account with API credentials

## Setup and Configuration
### Clone the repository
```bash
git clone https://github.com/your-username/habitica-sync-embedded-notion-node.git
cd habitica-sync-embedded-notion-node
```

### Install dependencies
```bash
npm install
```

### Create a .env file
This file will hold the environment variables needed for authentication and scheduling.

In the .env file, include the following values:
```makefile
NOTION_TOKEN=your_notion_token
NOTION_DATABASE_ID=your_database_id
HABITICA_API_USER=your_habitica_user_id
HABITICA_API_KEY=your_habitica_api_key
CRON_SCHEDULE=0 * * * *
NOTION_FIELD_PRIORITY=priority  # Default value is 'priority'
```

- Keep `CRON_SCHEDULE=0 * * * *` to set the sync job to run every hour.
- You can specify the name of the field in Notion you are using for task priority by setting `NOTION_FIELD_PRIORITY`. By default, this is set to `priority`.

### If You Are in Development
To run the project in a development environment:
```bash
npm run dev
```
This will start the server and execute the synchronization logic.

### Starting the Project
For regular users, to start the application and keep it running, you can use PM2. To run the app with PM2, use the following command:
```bash
pm2 start index.js --name "habitica sync notion"
```
PM2 will handle restarting the application if it crashes or stops. You can check if it's running by typing:
```bash
pm2 status
```
This will show the current processes and their status.
