function sumArray(numbers) {
    return numbers.reduce((acc, number) => acc + number, 0);
}

export { sumArray as evaluate };
