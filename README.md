# Simple GPT Chat API

This is a simple Node.js application that provides a chat interface with the OpenAI GPT API.

## Prerequisites

- Node.js and npm installed on your machine.

## Installation

1. Clone the repository (or download the files).
2. Open a terminal in the project directory.
3. Install the dependencies:
   ```bash
   npm install
   ```

## Configuration

1. Create a `.env` file in the root of the project.
2. Add your OpenAI API key to the `.env` file:
   ```
   OPENAI_API_KEY=your_openai_api_key
   ```
   Replace `your_openai_api_key` with your actual key.

3. Add your Admin API key for secure endpoints:
   ```
   ADMIN_API_KEY=your_secret_admin_key
   ```

## Running the Server

To start the server, run the following command in your terminal:

```bash
node index.js
```

The server will start on port 3000 by default.

## API Usage

You can interact with the chat API by sending a POST request to the `/chat` endpoint.

### Example using cURL

```bash
curl -X POST http://localhost:3000/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello, how are you?"}'
```

### Example Response

```json
{
  "response": "I am an AI assistant, so I don't have feelings, but I'm here to help you!"
}
```

---

## Advanced Usage

### View Source Code

You can view the source code of the application by sending a GET request to the `/source-code` endpoint. This requires a valid `ADMIN_API_KEY` to be sent in the `X-API-Key` header.

#### Example using cURL

```bash
curl http://localhost:3000/source-code?file=index.js \
     -H "X-API-Key: your_secret_admin_key"
```
