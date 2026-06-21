export function getFieldErrors(result) {
  if (result.success) return {};

  return result.error.issues.reduce((errors, issue) => {
    const field = issue.path[0] ?? 'form';
    if (!errors[field]) errors[field] = issue.message;
    return errors;
  }, {});
}
