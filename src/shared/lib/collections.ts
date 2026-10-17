export function binarySearch<T>(objects: Array<T>, cmp: (object: T) => number) {
  let left = 0
  let right = objects.length - 1

  while (left <= right) {
    const middle = left + Math.floor((right - left) / 2)
    const cmpResult = cmp(objects[middle])

    if (cmpResult < 0) {
      left = middle + 1
    } else if (cmpResult > 0) {
      right = middle - 1
    } else {
      return middle
    }
  }

  return left
}
