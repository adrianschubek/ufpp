/**
 * Syncronous fetch using a child process
 */
const url = process.argv[2];

fetch(url)
  .then(response => response.text())
  .then(data => {
    console.log(data);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
