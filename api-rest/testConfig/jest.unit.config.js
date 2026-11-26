module.exports = {
    rootDir: '../',
    roots: ['<rootDir>/src'],
    testMatch: ['**/?(*.)+(spec).ts'],
    setupFiles: ['<rootDir>/src/testing/sin-variables-de-instalacion.ts'],
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
