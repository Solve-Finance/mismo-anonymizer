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
      downloadLink.download = input.files[0].name.replace('.json', '').replace('.xml', '') + '.processed.json';
      downloadLink.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      const errorElement = document.getElementById('error');

      errorElement.style.display = 'block';
    }
  });

  input.click();
});
