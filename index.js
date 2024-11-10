require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Load environment variables
const {
    NOTION_TOKEN,
    NOTION_DATABASE_ID,
    HABITICA_API_USER,
    HABITICA_API_KEY,
    NOTION_FIELD_PRIORITY,
    CRON_SCHEDULE
} = process.env;

// Configure headers for Notion and Habitica
const headersNotion = {
    "Authorization": `Bearer ${NOTION_TOKEN}`,
    "Content-Type": "application/json",
    "Notion-Version": "2021-05-13"
};
const headersHabitica = {
    "x-api-user": HABITICA_API_USER,
    "x-api-key": HABITICA_API_KEY
};

// Folder for JSON backups
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Function to write JSON files with error handling
function writeJsonBackup(filename, data) {
    const filepath = path.join(dataDir, filename);
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 4), 'utf8');
        console.log(`Backup written to ${filepath}`);
    } catch (error) {
        console.error(`Error writing backup to ${filepath}:`, error);
    }
}

// Completed status
const completed = () => 'Done';
// Deleted status
const canceled = () => 'Canceled';
const archived = () => 'Archived';
// Creation status
const todo = () => 'To Do';
const backlog = () => 'BackLog';
const inprogress = () => 'In progress';

// Functions for Notion and Habitica integration
async function readDatabaseOfNotion() {
    const url = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`;
    try {
        const res = await axios.post(url, {}, { headers: headersNotion });
        const notionTasks = res.data.results.map(task => {
            var taskResult = {
                name: task.properties.Name.title[0].text.content,
                priority: task.properties[NOTION_FIELD_PRIORITY]?.select?.name,
                status: task.properties.Status.status.name,
                id: task.id
            }

            return taskResult;
        });
        writeJsonBackup('notion.json', notionTasks);
        return notionTasks;
    } catch (error) {
        console.error("Error reading Notion database:", error);
        return [];
    }
}

async function readHabiticaData() {
    const url = "https://habitica.com/api/v3/tasks/user?type=todos";
    try {
        const res = await axios.get(url, { headers: headersHabitica });
        const habiticaTasks = res.data.data.map(task => ({ name: task.text, id: task.id, alias: (task.alias ? task.alias : ""), done: false }));
        writeJsonBackup('habitica.json', habiticaTasks);
        return habiticaTasks;
    } catch (error) {
        console.error("Error reading Habitica data:", error);
        return [];
    }
}

async function readHabiticaDoneData() {
    const url = "https://habitica.com/api/v3/tasks/user?type=completedTodos";
    try {
        const res = await axios.get(url, { headers: headersHabitica });
        const habiticaDoneTasks = res.data.data.map(task => ({ name: task.text, id: task.id, alias: (task.alias ? task.alias : ""), done: true }));
        writeJsonBackup('habitica_done.json', habiticaDoneTasks);
        return habiticaDoneTasks;
    } catch (error) {
        console.error("Error reading Habitica completed data:", error);
        return [];
    }
}

async function createTodoInHabitica(name, priority, notionId) {
    const priorityMap = { Low: 1, Medium: 1.5, High: 2 };
    const url = "https://habitica.com/api/v3/tasks/user";
    try {
        await axios.post(url, { 
            text: name, 
            type: 'todo', 
            alias: `notion-${notionId}`,
            priority: priorityMap[priority] || 1 }, 
            { headers: headersHabitica });
        console.log(`Task '${name}' created in Habitica.`);
    } catch (error) {
        console.error("Error creating Habitica task:", error);
    }
}

async function updateTodoNameInHabitica(taskId, newName) {
    const url = `https://habitica.com/api/v3/tasks/${taskId}`;
    try {
        await axios.put(
            url,
            { text: newName },
            { headers: headersHabitica }
        );
        console.log(`Name for task with ID '${taskId}' updated in Habitica.`);
    } catch (error) {
        console.error("Error updating name for Habitica task:", error);
    }
}

async function deleteTodoInHabitica(taskId) {
    const url = `https://habitica.com/api/v3/tasks/${taskId}`;
    try {
        const response = await axios.delete(url, { headers: headersHabitica });
        if (response.status === 200) {
            console.log(`Task with ID '${taskId}' deleted from Habitica.`);
        }
    } catch (error) {
        console.error("Error deleting Habitica task:", error);
    }
}

async function scoreTaskInHabitica(id) {
    const url = `https://habitica.com/api/v3/tasks/${id}/score/up`;
    try {
        await axios.post(url, {}, { headers: headersHabitica });
        console.log(`Task with ID '${id}' scored in Habitica.`);
    } catch (error) {
        console.error("Error scoring Habitica task:", error);
    }
}

async function scoreTaskInNotion(id) {
    const url = `https://api.notion.com/v1/pages/${id}`;
    try {
        await axios.patch(url, { properties: { Status: { select: { name: completed() } } } }, { headers: headersNotion });
        console.log(`Task with ID '${id}' scored in Notion.`);
    } catch (error) {
        console.error("Error scoring Notion task:", error);
    }
}

// Sync Notion to Habitica
async function syncNotionToHabitica() {
    console.log('Syncing Notion to Habitica...');
    const habiticaTodoList = await readHabiticaData();
    const habiticaDoneList = await readHabiticaDoneData();
    const notionTasks = await readDatabaseOfNotion();  
    
    const habiticaList = [...new Set([...habiticaTodoList, ...habiticaDoneList])];

    for (const task of notionTasks) {
        const habiticaTask = habiticaList.find(t => t.alias === `notion-${task.id}`);
        if (!habiticaTask && (task.status === todo() || task.status === backlog() || task.status === inprogress())) {
            await createTodoInHabitica(task.name + ` ***(${task.status})***`.toUpperCase() , task.priority, task.id);
        } else if (habiticaTask){
            await updateTodoNameInHabitica(habiticaTask.id, task.name + ` ***(${task.status})***`.toUpperCase() );

            if (task.status === completed() && !habiticaTask.done) {
                await scoreTaskInHabitica(habiticaTask.id);        
            }

            if(task.status === archived() || task.status === canceled()){
                await deleteTodoInHabitica(habiticaTask.id);   
            }
        }
    }
}

// Sync Habitica to Notion
async function syncHabiticaToNotion() {
    console.log('Syncing Habitica to Notion...');
    const habiticaDoneList = await readHabiticaDoneData();
    const notionTasks = await readDatabaseOfNotion();
    const notionNotDoneTasks = notionTasks.filter(task => task.status !== completed());

    for (const task of notionNotDoneTasks) {
        const habiticaTask = habiticaDoneList.find(t => t.alias === `notion-${task.id}`);
        if (habiticaTask) {
            await scoreTaskInNotion(task.id);
        }
    }
}

// Main function to read and sync tasks
async function syncTasks() {
    console.log('Reading and syncing data...');
    await syncNotionToHabitica();
    //await syncHabiticaToNotion();
}

// Run immediately on startup
syncTasks();

// Schedule sync using cron
cron.schedule(CRON_SCHEDULE, () => {
    console.log("Running scheduled sync...");
    syncTasks();
});
