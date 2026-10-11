# CardGame

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.2.21.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Firebase

Execute `npm run setup` para instalar Firebase 10 e AngularFire 18, compativeis com o Angular deste projeto. O setup preserva os arquivos de environment existentes.

A configuracao do projeto Firebase fica em `src/environments/environment.ts` (producao) e `src/environments/environment.development.ts` (desenvolvimento).

Execute `npm start` para desenvolver e `npm run build` para gerar a aplicacao. O Firebase Hosting usa `dist/card-game/browser`.
