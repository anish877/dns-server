const express = require('express');
const { exec } = require('child_process');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));  // Serve static CSS file

app.set('view engine', 'ejs');  // Set EJS as templating engine

// Route to render the form
app.get('/', (req, res) => {
  res.render('index');
});

// Route to handle form submission and run commands
app.post('/run-dns-commands', (req, res) => {
  const { resolver, domain } = req.body;

  const startServerCommand = `node main.js --resolver ${resolver}`;
  
  exec(startServerCommand, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: `Error starting server: ${stderr || error.message}` });
    }

    const digCommand = `dig @127.0.0.1 -p 2053 ${domain}`;

    exec(digCommand, (digError, digStdout, digStderr) => {
      if (digError) {
        return res.status(500).json({ error: `Error running dig: ${digStderr || digError.message}` });
      }

      // Send the result of dig command back to the frontend
      res.json({ result: digStdout });
    });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});