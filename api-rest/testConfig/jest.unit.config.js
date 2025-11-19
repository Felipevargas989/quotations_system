module.exports = {
    rootDir: '../',
    roots: ['<rootDir>/src'],
    testMatch: ['**/?(*.)+(spec).ts'],
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
      '^src/(.*)$': '<rootDir>/src/$1',
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
    transform: {
      '^.+\\.(t|j)s$': [
        'ts-jest',
        {
          tsconfig: {
            baseUrl: './',
          },
        },
      ],
    },
};
