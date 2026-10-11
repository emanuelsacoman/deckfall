import { CanDeactivateFn } from '@angular/router';

export const cardEditorLeaveGuard: CanDeactivateFn<{ canLeave(): boolean }> = component => component.canLeave();
