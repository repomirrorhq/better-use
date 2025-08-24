/**
 * Test suite for DOM serialization functionality
 * Tests the DOM service's ability to serialize complex HTML structures
 * into the format used by the agent for understanding page content
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BrowserSession } from '../src/browser/session';
import { BrowserProfile } from '../src/browser/profile';
import { DOMService } from '../src/dom/service';
import { DOMSerializer } from '../src/dom/serializer/serializer';
import { HTTPServer } from '../test-utils/http-server';

describe('DOM Serialization', () => {
  let server: HTTPServer;
  let browserSession: BrowserSession;
  let domService: DOMService;

  beforeEach(async () => {
    // Set up HTTP test server
    server = new HTTPServer();
    await server.start();

    // Set up browser session
    const profile = new BrowserProfile({
      headless: true,
      browserType: 'chromium'
    });
    browserSession = new BrowserSession(profile);
    await browserSession.start();

    // Set up DOM service
    domService = new DOMService(browserSession);
  });

  afterEach(async () => {
    if (browserSession) {
      await browserSession.close();
    }
    if (server) {
      await server.stop();
    }
  });

  it('should serialize simple HTML structure correctly', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Simple Page</title></head>
      <body>
        <h1>Test Page</h1>
        <p>This is a paragraph.</p>
        <button id="test-btn">Click Me</button>
        <a href="/next">Next Page</a>
      </body>
      </html>
    `;

    server.addRoute('/simple', html);
    await browserSession.page.goto(server.getUrl('/simple'));
    
    const serialized = await domService.getSerializedDOM();
    
    expect(serialized).toBeDefined();
    expect(serialized).toContain('Test Page');
    expect(serialized).toContain('Click Me');
    expect(serialized).toContain('Next Page');
    
    // Check that clickable elements are properly indexed
    const clickableElements = await domService.getClickableElements();
    expect(clickableElements).toBeDefined();
    expect(Object.keys(clickableElements).length).toBeGreaterThan(0);
    
    // Button and link should be clickable
    const clickableTexts = Object.values(clickableElements).map(el => el.text);
    expect(clickableTexts).toContain('Click Me');
    expect(clickableTexts).toContain('Next Page');
  });

  it('should handle forms with various input types', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <body>
        <form id="test-form">
          <input type="text" name="username" placeholder="Username">
          <input type="password" name="password" placeholder="Password">
          <input type="email" name="email" placeholder="Email">
          <input type="checkbox" name="remember" id="remember">
          <label for="remember">Remember me</label>
          <input type="radio" name="plan" value="basic" id="basic">
          <label for="basic">Basic</label>
          <input type="radio" name="plan" value="pro" id="pro">
          <label for="pro">Pro</label>
          <select name="country">
            <option value="">Select Country</option>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
            <option value="ca">Canada</option>
          </select>
          <textarea name="comments" placeholder="Comments"></textarea>
          <button type="submit">Submit</button>
        </form>
      </body>
      </html>
    `;

    server.addRoute('/form', html);
    await browserSession.page.goto(server.getUrl('/form'));
    
    const serialized = await domService.getSerializedDOM();
    
    // Check that all form elements are captured
    expect(serialized).toContain('Username');
    expect(serialized).toContain('Password');
    expect(serialized).toContain('Email');
    expect(serialized).toContain('Remember me');
    expect(serialized).toContain('Basic');
    expect(serialized).toContain('Pro');
    expect(serialized).toContain('Select Country');
    expect(serialized).toContain('Comments');
    expect(serialized).toContain('Submit');
    
    const clickableElements = await domService.getClickableElements();
    const inputElements = Object.values(clickableElements).filter(
      el => el.tag_name === 'input' || el.tag_name === 'select' || el.tag_name === 'textarea'
    );
    
    // Should have multiple input elements
    expect(inputElements.length).toBeGreaterThan(5);
  });

  it('should handle nested structures and complex layouts', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <body>
        <header>
          <nav>
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/about">About</a></li>
              <li>
                <a href="/products">Products</a>
                <ul class="dropdown">
                  <li><a href="/products/widgets">Widgets</a></li>
                  <li><a href="/products/gadgets">Gadgets</a></li>
                </ul>
              </li>
            </ul>
          </nav>
        </header>
        <main>
          <article>
            <h2>Article Title</h2>
            <section>
              <p>First section content.</p>
              <div class="nested">
                <div class="deep">
                  <button>Deeply Nested Button</button>
                </div>
              </div>
            </section>
          </article>
          <aside>
            <h3>Sidebar</h3>
            <div class="widget">
              <input type="search" placeholder="Search...">
              <button>Search</button>
            </div>
          </aside>
        </main>
        <footer>
          <p>&copy; 2025 Test Site</p>
        </footer>
      </body>
      </html>
    `;

    server.addRoute('/complex', html);
    await browserSession.page.goto(server.getUrl('/complex'));
    
    const serialized = await domService.getSerializedDOM();
    
    // Check navigation links
    expect(serialized).toContain('Home');
    expect(serialized).toContain('About');
    expect(serialized).toContain('Products');
    expect(serialized).toContain('Widgets');
    expect(serialized).toContain('Gadgets');
    
    // Check main content
    expect(serialized).toContain('Article Title');
    expect(serialized).toContain('First section content');
    expect(serialized).toContain('Deeply Nested Button');
    
    // Check sidebar
    expect(serialized).toContain('Sidebar');
    expect(serialized).toContain('Search...');
    
    // Check footer
    expect(serialized).toContain('2025 Test Site');
    
    const clickableElements = await domService.getClickableElements();
    const links = Object.values(clickableElements).filter(el => el.tag_name === 'a');
    const buttons = Object.values(clickableElements).filter(el => el.tag_name === 'button');
    
    expect(links.length).toBeGreaterThanOrEqual(5); // Navigation links
    expect(buttons.length).toBeGreaterThanOrEqual(2); // Search and nested button
  });

  it('should handle tables correctly', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <body>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Widget A</td>
              <td>$19.99</td>
              <td>In Stock</td>
              <td><button class="buy-btn">Buy</button></td>
            </tr>
            <tr>
              <td>Widget B</td>
              <td>$29.99</td>
              <td>Low Stock</td>
              <td><button class="buy-btn">Buy</button></td>
            </tr>
            <tr>
              <td>Widget C</td>
              <td>$39.99</td>
              <td>Out of Stock</td>
              <td><button class="buy-btn" disabled>Buy</button></td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    server.addRoute('/table', html);
    await browserSession.page.goto(server.getUrl('/table'));
    
    const serialized = await domService.getSerializedDOM();
    
    // Check table headers
    expect(serialized).toContain('Product');
    expect(serialized).toContain('Price');
    expect(serialized).toContain('Stock');
    expect(serialized).toContain('Action');
    
    // Check table data
    expect(serialized).toContain('Widget A');
    expect(serialized).toContain('$19.99');
    expect(serialized).toContain('In Stock');
    expect(serialized).toContain('Widget B');
    expect(serialized).toContain('$29.99');
    expect(serialized).toContain('Low Stock');
    expect(serialized).toContain('Widget C');
    expect(serialized).toContain('$39.99');
    expect(serialized).toContain('Out of Stock');
    
    const clickableElements = await domService.getClickableElements();
    const buyButtons = Object.values(clickableElements).filter(
      el => el.tag_name === 'button' && el.text === 'Buy'
    );
    
    // Should have 2 enabled buy buttons (3rd is disabled)
    expect(buyButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle hidden and invisible elements appropriately', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <body>
        <div>
          <p>Visible content</p>
          <p style="display: none;">Hidden with display none</p>
          <p style="visibility: hidden;">Hidden with visibility</p>
          <p style="opacity: 0;">Hidden with opacity</p>
          <button>Visible Button</button>
          <button style="display: none;">Hidden Button</button>
          <div style="height: 0; overflow: hidden;">
            <p>Hidden in collapsed div</p>
          </div>
          <input type="hidden" name="hidden_field" value="secret">
        </div>
      </body>
      </html>
    `;

    server.addRoute('/hidden', html);
    await browserSession.page.goto(server.getUrl('/hidden'));
    
    const serialized = await domService.getSerializedDOM();
    
    // Visible content should be present
    expect(serialized).toContain('Visible content');
    expect(serialized).toContain('Visible Button');
    
    // Hidden content might or might not be included depending on serialization strategy
    // But hidden elements should not be in clickable elements
    const clickableElements = await domService.getClickableElements();
    const buttonTexts = Object.values(clickableElements)
      .filter(el => el.tag_name === 'button')
      .map(el => el.text);
    
    expect(buttonTexts).toContain('Visible Button');
    expect(buttonTexts).not.toContain('Hidden Button');
  });

  it('should handle special characters and encoding', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <body>
        <h1>Special Characters & Encoding</h1>
        <p>Price: €50.00 / £40.00</p>
        <p>Math: 2 < 3 && 4 > 3</p>
        <p>Quotes: "Hello" and 'World'</p>
        <p>Unicode: 你好世界 🌍 مرحبا</p>
        <button data-action="save&continue">Save & Continue</button>
        <input type="text" placeholder="Enter name (e.g., O'Brien)">
      </body>
      </html>
    `;

    server.addRoute('/special', html);
    await browserSession.page.goto(server.getUrl('/special'));
    
    const serialized = await domService.getSerializedDOM();
    
    // Check that special characters are preserved
    expect(serialized).toContain('Special Characters');
    expect(serialized).toContain('€50.00');
    expect(serialized).toContain('£40.00');
    expect(serialized).toContain('Save & Continue');
    
    // Check Unicode support
    expect(serialized).toContain('你好世界');
    expect(serialized).toContain('🌍');
    expect(serialized).toContain('مرحبا');
  });

  it('should handle iframes appropriately', async () => {
    const mainHtml = `
      <!DOCTYPE html>
      <html>
      <body>
        <h1>Main Page</h1>
        <iframe src="/iframe-content" width="500" height="300"></iframe>
        <button>Main Page Button</button>
      </body>
      </html>
    `;
    
    const iframeHtml = `
      <!DOCTYPE html>
      <html>
      <body>
        <h2>Iframe Content</h2>
        <p>This is inside an iframe</p>
        <button>Iframe Button</button>
      </body>
      </html>
    `;

    server.addRoute('/iframe-page', mainHtml);
    server.addRoute('/iframe-content', iframeHtml);
    
    await browserSession.page.goto(server.getUrl('/iframe-page'));
    
    const serialized = await domService.getSerializedDOM();
    
    // Main page content should be present
    expect(serialized).toContain('Main Page');
    expect(serialized).toContain('Main Page Button');
    
    // Iframe content handling depends on configuration
    // Some implementations might include iframe content, others might not
    const clickableElements = await domService.getClickableElements();
    const mainButtons = Object.values(clickableElements).filter(
      el => el.tag_name === 'button' && el.text === 'Main Page Button'
    );
    
    expect(mainButtons.length).toBeGreaterThan(0);
  });

  it('should maintain element indices consistently', async () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <body>
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
        <button id="btn3">Button 3</button>
        <a href="/link1">Link 1</a>
        <a href="/link2">Link 2</a>
        <input type="text" id="input1" placeholder="Input 1">
        <input type="text" id="input2" placeholder="Input 2">
      </body>
      </html>
    `;

    server.addRoute('/indexed', html);
    await browserSession.page.goto(server.getUrl('/indexed'));
    
    // Get clickable elements multiple times
    const elements1 = await domService.getClickableElements();
    const elements2 = await domService.getClickableElements();
    
    // Indices should be consistent between calls
    expect(Object.keys(elements1).sort()).toEqual(Object.keys(elements2).sort());
    
    // Elements with same properties should have same indices
    Object.keys(elements1).forEach(index => {
      expect(elements1[index].text).toEqual(elements2[index].text);
      expect(elements1[index].tag_name).toEqual(elements2[index].tag_name);
    });
    
    // Check that indices are sequential starting from 1
    const indices = Object.keys(elements1).map(Number).sort((a, b) => a - b);
    expect(indices[0]).toBe(1);
    
    // Check for no gaps in indices (optional, depends on implementation)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i] - indices[i-1]).toBeLessThanOrEqual(1);
    }
  });
});