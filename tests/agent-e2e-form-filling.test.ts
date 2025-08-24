import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Agent } from '../src/agent';
import { BrowserSession } from '../src/browser/session';
import { MockLLM } from './test-utils/mockLLM';

describe('Agent E2E - Form Filling and Submission', () => {
  let browser: BrowserSession;

  beforeAll(async () => {
    browser = new BrowserSession({
      profile: {
        headless: true,
        disableImages: true,
      },
    });
    await browser.start();
  });

  afterAll(async () => {
    if (browser) {
      await browser.stop();
    }
  });

  it('should fill and submit a simple contact form', async () => {
    const mockActions = [
      // Navigate to form page
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: `data:text/html,
              <html>
                <body>
                  <form id="contact-form">
                    <input type="text" name="name" placeholder="Name" />
                    <input type="email" name="email" placeholder="Email" />
                    <textarea name="message" placeholder="Message"></textarea>
                    <button type="submit">Send</button>
                  </form>
                  <script>
                    document.getElementById('contact-form').onsubmit = function(e) {
                      e.preventDefault();
                      document.body.innerHTML = '<div id="success">Form submitted successfully!</div>';
                      return false;
                    }
                  </script>
                </body>
              </html>`,
          },
        },
      },
      // Fill name field
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'John Doe',
            index: 0,
          },
        },
      },
      // Fill email field
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'john.doe@example.com',
            index: 1,
          },
        },
      },
      // Fill message field
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'This is a test message for the contact form.',
            index: 2,
          },
        },
      },
      // Click submit button
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 3,
          },
        },
      },
      // Verify success message
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Form submitted successfully!',
      },
      // Done
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Fill the contact form with name "John Doe", email "john.doe@example.com", and message "This is a test message for the contact form."',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 10,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify form filling steps
    const typeSteps = history.filter(
      (step) => step.action?.name === 'type_text'
    );
    expect(typeSteps.length).toBe(3);
    expect(typeSteps[0].action?.parameters?.text).toBe('John Doe');
    expect(typeSteps[1].action?.parameters?.text).toBe('john.doe@example.com');
    expect(typeSteps[2].action?.parameters?.text).toContain('test message');

    // Verify form submission
    const clickStep = history.find(
      (step) => step.action?.name === 'click_element'
    );
    expect(clickStep).toBeDefined();

    // Verify success extraction
    const extractStep = history.find(
      (step) => step.action?.name === 'extract_page_info'
    );
    expect(extractStep).toBeDefined();

    // Check completion
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should handle dropdown selections in forms', async () => {
    const mockActions = [
      // Navigate to form with dropdown
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: `data:text/html,
              <html>
                <body>
                  <form>
                    <select name="country" id="country">
                      <option value="">Select Country</option>
                      <option value="us">United States</option>
                      <option value="uk">United Kingdom</option>
                      <option value="ca">Canada</option>
                    </select>
                    <select name="language" id="language">
                      <option value="">Select Language</option>
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                    </select>
                    <button type="submit">Submit</button>
                  </form>
                </body>
              </html>`,
          },
        },
      },
      // Get dropdown options for country
      {
        action: {
          name: 'get_dropdown_options',
          parameters: {
            index: 0,
          },
        },
      },
      // Select United States
      {
        action: {
          name: 'select_dropdown_option',
          parameters: {
            dropdown_index: 0,
            option_index: 1,
          },
        },
      },
      // Get dropdown options for language
      {
        action: {
          name: 'get_dropdown_options',
          parameters: {
            index: 1,
          },
        },
      },
      // Select English
      {
        action: {
          name: 'select_dropdown_option',
          parameters: {
            dropdown_index: 1,
            option_index: 1,
          },
        },
      },
      // Submit form
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 2,
          },
        },
      },
      // Done
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Select United States as country and English as language in the form',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 10,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify dropdown interactions
    const getOptionsSteps = history.filter(
      (step) => step.action?.name === 'get_dropdown_options'
    );
    expect(getOptionsSteps.length).toBe(2);

    const selectSteps = history.filter(
      (step) => step.action?.name === 'select_dropdown_option'
    );
    expect(selectSteps.length).toBe(2);

    // Verify form submission
    const clickStep = history.find(
      (step) => step.action?.name === 'click_element'
    );
    expect(clickStep).toBeDefined();

    // Check completion
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should handle checkbox and radio button interactions', async () => {
    const mockActions = [
      // Navigate to form with checkboxes and radio buttons
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: `data:text/html,
              <html>
                <body>
                  <form>
                    <input type="checkbox" id="terms" name="terms" />
                    <label for="terms">Accept Terms</label><br>
                    <input type="checkbox" id="newsletter" name="newsletter" />
                    <label for="newsletter">Subscribe to Newsletter</label><br>
                    <input type="radio" id="plan1" name="plan" value="basic" />
                    <label for="plan1">Basic Plan</label><br>
                    <input type="radio" id="plan2" name="plan" value="premium" />
                    <label for="plan2">Premium Plan</label><br>
                    <button type="submit">Submit</button>
                  </form>
                </body>
              </html>`,
          },
        },
      },
      // Check the terms checkbox
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 0,
          },
        },
      },
      // Check the newsletter checkbox
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 1,
          },
        },
      },
      // Select premium plan radio button
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 3,
          },
        },
      },
      // Submit form
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 4,
          },
        },
      },
      // Done
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Accept terms, subscribe to newsletter, select premium plan, and submit',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 8,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify all clicks were executed
    const clickSteps = history.filter(
      (step) => step.action?.name === 'click_element'
    );
    expect(clickSteps.length).toBe(4);

    // Check completion
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should handle form validation errors', async () => {
    const mockActions = [
      // Navigate to form with validation
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: `data:text/html,
              <html>
                <body>
                  <form id="validated-form">
                    <input type="email" name="email" required placeholder="Email (required)" />
                    <input type="password" name="password" required minlength="8" placeholder="Password (min 8 chars)" />
                    <button type="submit">Submit</button>
                    <div id="error" style="color: red; display: none;"></div>
                  </form>
                  <script>
                    document.getElementById('validated-form').onsubmit = function(e) {
                      e.preventDefault();
                      const email = this.email.value;
                      const password = this.password.value;
                      const error = document.getElementById('error');
                      
                      if (!email) {
                        error.textContent = 'Email is required';
                        error.style.display = 'block';
                        return false;
                      }
                      if (password.length < 8) {
                        error.textContent = 'Password must be at least 8 characters';
                        error.style.display = 'block';
                        return false;
                      }
                      
                      document.body.innerHTML = '<div>Success!</div>';
                      return false;
                    }
                  </script>
                </body>
              </html>`,
          },
        },
      },
      // Try to submit without filling (will fail)
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 2,
          },
        },
      },
      // Check error message
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Email is required',
      },
      // Fill email only
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'test@example.com',
            index: 0,
          },
        },
      },
      // Try to submit with short password
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'short',
            index: 1,
          },
        },
      },
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 2,
          },
        },
      },
      // Check error message
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Password must be at least 8 characters',
      },
      // Clear and fill with valid password
      {
        action: {
          name: 'clear_input',
          parameters: {
            index: 1,
          },
        },
      },
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'validpassword123',
            index: 1,
          },
        },
      },
      // Submit successfully
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 2,
          },
        },
      },
      // Verify success
      {
        action: {
          name: 'extract_page_info',
          parameters: {},
        },
        extracted_content: 'Success!',
      },
      // Done
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Test form validation by submitting invalid data first, then correcting it',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 15,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify validation error handling
    const extractSteps = history.filter(
      (step) => step.action?.name === 'extract_page_info'
    );
    expect(extractSteps.length).toBeGreaterThanOrEqual(2);

    // Verify form was eventually submitted successfully
    const successExtract = extractSteps.find(
      (step) => step.extracted_content === 'Success!'
    );
    expect(successExtract).toBeDefined();

    // Check completion
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);

  it('should handle file uploads in forms', async () => {
    const mockActions = [
      // Navigate to form with file upload
      {
        action: {
          name: 'navigate_to_url',
          parameters: {
            url: `data:text/html,
              <html>
                <body>
                  <form enctype="multipart/form-data">
                    <input type="text" name="title" placeholder="Title" />
                    <input type="file" name="document" accept=".pdf,.doc,.txt" />
                    <button type="submit">Upload</button>
                  </form>
                </body>
              </html>`,
          },
        },
      },
      // Fill title field
      {
        action: {
          name: 'type_text',
          parameters: {
            text: 'Test Document',
            index: 0,
          },
        },
      },
      // Upload file (note: in real scenario, this would use upload_file action)
      {
        action: {
          name: 'upload_file',
          parameters: {
            file_path: '/tmp/test.txt',
            input_index: 1,
          },
        },
      },
      // Submit form
      {
        action: {
          name: 'click_element',
          parameters: {
            index: 2,
          },
        },
      },
      // Done
      {
        action: {
          name: 'done',
          parameters: {},
        },
      },
    ];

    const mockLLM = new MockLLM(mockActions);

    const agent = new Agent({
      task: 'Upload a test document with title "Test Document"',
      llm: mockLLM,
      browser,
      maxStepsPerRun: 8,
      includeGif: false,
    });

    const history = await agent.run();

    // Verify title was filled
    const typeStep = history.find(
      (step) => step.action?.name === 'type_text'
    );
    expect(typeStep).toBeDefined();
    expect(typeStep?.action?.parameters?.text).toBe('Test Document');

    // Verify file upload action
    const uploadStep = history.find(
      (step) => step.action?.name === 'upload_file'
    );
    expect(uploadStep).toBeDefined();

    // Verify form submission
    const clickStep = history.find(
      (step) => step.action?.name === 'click_element'
    );
    expect(clickStep).toBeDefined();

    // Check completion
    const doneStep = history.find((step) => step.action?.name === 'done');
    expect(doneStep).toBeDefined();
  }, 30000);
});