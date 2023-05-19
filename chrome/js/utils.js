export const removeNonNumeric = (x) => {
  return x.replace(/[^0-9.-]/g, '');
};

export const isValidDate = (dateString) => {
  // Regular expression for the format YYYY-MM-DD
  let regex = /^\d{4}-\d{2}-\d{2}$/;

  // Validate the format
  if (!regex.test(dateString)) {
    return false;
  }

  // Parse the date components
  let parts = dateString.split("-");
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10);
  let day = parseInt(parts[2], 10);

  // Create a Date object and check if it's a valid date
  let date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
  );
}
