/**
 * Example of implementing notification functionality.
 * 
 * This shows how to send email notifications when tasks are completed.
 */

import nodemailer from 'nodemailer';
import { Agent } from '../../src/agent';
import { Controller } from '../../src/controller';
import { ActionResult } from '../../src/agent/views';
import { ChatOpenAI } from '../../src/llm/providers/openai';

const controller = new Controller();

// Register custom done action with email notification
controller.action(
  'Done with task',
  async (params: { text: string }) => {
    const { text } = params;

    try {
      // Create transporter for sending emails
      // To send emails:
      // STEP 1: Go to https://support.google.com/accounts/answer/185833
      // STEP 2: Create an app password (you can't use your normal gmail password)
      // STEP 3: Use the app password in the code below for the password
      const transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'your_email@gmail.com',
          pass: process.env.EMAIL_APP_PASSWORD || 'your_app_password'
        }
      });

      const mailOptions = {
        from: process.env.EMAIL_USER || 'your_email@gmail.com',
        to: process.env.EMAIL_RECIPIENT || 'recipient@example.com',
        subject: 'Browser-Use Task Completed',
        text: `Task completed with result:\n${text}`
      };

      await transporter.sendMail(mailOptions);
      
      return ActionResult.done('Email notification sent!');
    } catch (error) {
      console.error('Failed to send email notification:', error);
      return ActionResult.done('Task completed (email notification failed)');
    }
  }
);

async function main() {
  const task = 'go to browser-use.com and then done';
  const model = new ChatOpenAI({ 
    model: 'gpt-4-turbo',
    apiKey: process.env.OPENAI_API_KEY!
  });
  
  const agent = new Agent({ 
    task, 
    llm: model, 
    controller 
  });

  await agent.run();
}

if (require.main === module) {
  main().catch(console.error);
}