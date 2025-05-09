async function main() {
    const result = fetchData();  // Bug: missing 'await'
    console.log(result);  // Will log a Promise instead of the actual data
}
main();


