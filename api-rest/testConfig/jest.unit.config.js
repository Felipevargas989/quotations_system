module.exports = {
    rootDir: '../',
    roots: ['<rootDir>/src'],
    testMatch: ['**/?(*.)+(spec).ts'],
    transform: {
      '^.+\\.(t|j)s$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
    testEnvironment: 'node',
    moduleNameMapper: {
      '^src/(.*)$': '<rootDir>/src/$1',
    },
};
