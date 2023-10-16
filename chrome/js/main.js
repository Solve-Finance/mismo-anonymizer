import { parseSelectedFile } from './parser.service.js';

document.getElementById('select-file-button').addEventListener('click', function() {
  const input = document.createElement('input');

  input.type = 'file';
  input.accept = '.json, .xml';

  input.addEventListener('change', async function() {
    try {
      const data = await parseSelectedFile(input.files[0]);

      const jsonContent = JSON.stringify(data);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const downloadLink = document.createElement('a');
      downloadLink.href = url;

      const date = new Date();
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();

      downloadLink.download = `solve-debt-optimizer.${year}${month}${day}.json`;
      downloadLink.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);

      const errorElement = document.getElementById('error');

      errorElement.style.display = 'block';
      errorElement.innerText = err.message;
    }
  });

  input.click();
});

window.onerror = function(msg, url, line, col, error) {
  console.error(msg, url, line, col, error);

  const errorElement = document.getElementById('error');

  errorElement.style.display = 'block';
  errorElement.innerHTML = `<div>
    <p>${msg}</p>
    ${url && `<p>${url.split('/js')[1]}:${line}:${col}</p>`}
  </div>`;
};
