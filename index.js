require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Jira configuration 
const jiraConfig = {
    baseUrl: process.env.JIRA_BASE_URL,
    issueUrl: process.env.JIRA_ISSUE_URL,
    projectsUrl: process.env.JIRA_PROJECTS_URL,
    auth: {
        username: process.env.JIRA_USERNAME,
        password: process.env.JIRA_API_TOKEN
    },
    defaultProject: process.env.JIRA_DEFAULT_PROJECT,
};

app.get('/', (req, res) => {
    res.status(200).json({ status: 'up', message: 'SonarQube webhook server is running' });
});

// get projects from Jira
app.get('/jira-projects', async (req, res) => {
    console.log('call from webhook server to fetch Jira projects');
    try {
        const response = await axios.get(jiraConfig.projectsUrl, {
            auth: jiraConfig.auth,
            headers: {
                'Accept': 'application/json'
            }
        });

        console.log('Available Jira projects:');
        response.data.forEach(project => {
            console.log(`- ${project.name} (Key: ${project.key})`);
        });

        res.json({
            projects: response.data,
            currentlyUsing: jiraConfig.defaultProject
        });
    } catch (error) {
        console.error('Error fetching Jira projects:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch Jira projects',
            details: error.response?.data || error.message
        });
    }
});


// get issues from SonarQube
app.get('/sonarqube-issues', async (req, res) => {
    const sonarUrl = process.env.SONARQUBE_URL;
    const sonarToken = process.env.SONARQUBE_TOKEN;

    try {
        const response = await axios.get(sonarUrl, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${sonarToken}:`).toString('base64')}`,
                'Accept': 'application/json'
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error fetching SonarQube issues:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch SonarQube issues',
            details: error.response?.data || error.message
        });
    }
});


// Webhook endpoint for SonarQube
app.post('/sonarqube-webhook', async (req, res) => {
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('Webhook endpoint hit with data:', req.body);
    const sonarData = req.body;
    console.log('Received from SonarQube:', JSON.stringify(req.body, null, 2));

    // Check if payload has the expected structure
    if (!sonarData.issues || !Array.isArray(sonarData.issues)) {
        return res.status(400).json({
            error: 'Invalid payload structure',
            message: 'Expecting issues array in the payload'
        });
    }

    // Create Jira Ticket
    try {
        const createdTickets = [];

        for (const issue of sonarData.issues) {
            // Create Jira payload with required fields
            const jiraPayload = {
                fields: {
                    project: { key: jiraConfig.defaultProject },
                    summary: `SonarQube Issue: ${issue.rule || issue.key}`,
                    description: {
                        type: "doc",
                        version: 1,
                        content: [
                            {
                                type: "paragraph",
                                content: [
                                    {
                                        type: "text",
                                        text: `Issue: ${issue.message}\nComponent: ${issue.component}\nSeverity: ${issue.severity}`
                                    }
                                ]
                            }
                        ]
                    },
                    issuetype: { name: "Bug" },
                    components: [
                        {
                            name: jiraConfig.defaultProject
                        }
                    ],
                    customfield_10201: {
                        value: "Financial Analyzer (FA)"
                    },
                    priority: {
                        name: "Medium"
                    }
                }
            };

            const jiraResponse = await axios.post(jiraConfig.issueUrl, jiraPayload, {
                auth: jiraConfig.auth,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            console.log('Jira ticket created:', jiraResponse.data.key);
            createdTickets.push(jiraResponse.data.key);
        }

        res.status(200).json({
            message: 'Jira tickets created successfully',
            tickets: createdTickets
        });
    } catch (error) {
        console.error('Error creating Jira ticket:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to create Jira ticket',
            details: error.response?.data || error.message
        });
    }
});




app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
