function sumArray(numbers) {
    return numbers.reduce((acc, number) => acc + number, 0);
}

module.exports = {
    sumArray
}