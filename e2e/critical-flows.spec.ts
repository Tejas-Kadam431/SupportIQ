import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const state=()=>JSON.parse(readFileSync('e2e/.state.json','utf8'));
async function login(page:Page,email='priya.admin@supportiq.app') {
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('password123');
 await page.getByLabel('Password',{exact:true}).press('Enter');await expect(page).toHaveURL(/dashboard/);
}
test('support workflow: edit evidence-grounded reply and record EDITED',async({page})=>{
 await login(page);await page.goto('/tickets/'+state().ticketId);
 await page.getByLabel('Status',{exact:true}).selectOption('IN_PROGRESS');await expect(page.getByLabel('Status',{exact:true})).toHaveValue('IN_PROGRESS');
 await page.getByRole('button',{name:'Run AI Copilot',exact:true}).click();
 await expect(page.getByLabel('Suggested customer reply')).toBeVisible();
 await expect(page.getByText(/Sources:/).first()).toBeVisible();
 const reply='Please check your spam folder and request a fresh password reset link. I can help if it still does not arrive.';
 await page.getByLabel('Suggested customer reply').fill(reply);page.once('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Send as message',exact:true}).click();
 await expect(page.getByText('Edited Copilot response recorded for AI quality analysis.')).toBeVisible();
 await expect(page.locator('.message-thread-card').getByText(reply,{exact:true})).toBeVisible();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/ticket-evidence.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByLabel('Suggested customer reply')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/ticket-mobile.png',fullPage:true});
});
test('insufficient evidence abstains without a send action',async({page})=>{
 await login(page);await page.goto('/tickets/'+state().abstentionId);await page.getByRole('button',{name:'Run AI Copilot',exact:true}).click();
 await expect(page.getByText('Reply needs agent review')).toBeVisible();await expect(page.getByRole('button',{name:'Send as message',exact:true})).toHaveCount(0);
 await expect(page.locator('.ai-warning-box').first()).not.toBeEmpty();
});
test('knowledge replacement prepares before explicit publication',async({page})=>{
 await login(page);await page.goto('/knowledge-base');
 const card=page.locator('article').filter({hasText:'Password'}).first();await card.getByRole('button',{name:'Version history',exact:true}).click();
 await card.getByLabel('Replacement document').setInputFiles({name:'password-policy-v2.txt',mimeType:'text/plain',buffer:Buffer.from('Password reset email troubleshooting: check spam folders. Request a fresh password reset link from the account login screen. Contact support if email does not arrive after ten minutes.')});
 await card.getByRole('button',{name:'Upload new version',exact:true}).click();
 await expect(card.getByRole('button',{name:'Publish v2',exact:true})).toBeVisible({timeout:60000});
 await expect(card.getByText(/Published v1/)).toBeVisible();await card.getByRole('button',{name:'Publish v2',exact:true}).click();await expect(card.getByText(/Published v2/)).toBeVisible();
 await expect(card.getByText(/superseded/)).toBeVisible();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/version-history.png',fullPage:true});
});
test('knowledge issue and seeded replay expose historical verification',async({page})=>{
 await login(page);await page.goto('/quality');await page.getByRole('button',{name:'Knowledge Issues',exact:true}).click();
 await page.getByRole('button',{name:/DEMO.*Annual refund/i}).first().click();
 await expect(page.getByText(/VERIFIED/).first()).toBeVisible();await expect(page.getByText(/historical cases/).first()).toBeVisible();
 await page.getByRole('button',{name:'View verification experiments'}).click();
 await expect(page.getByText('Failure cases improved: 6 / 6').first()).toBeVisible();await expect(page.getByText('Guardrails preserved: 10 / 10').first()).toBeVisible();
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/reliability-lab.png',fullPage:true});
});
test('customer cannot reach staff workflows or another customer ticket',async({page})=>{
 await login(page,'aarav.customer@example.com');await page.goto('/quality');await expect(page.getByText('Staff access is required.')).toBeVisible();
 await page.goto('/tickets/'+state().foreignTicketId);await expect(page.getByRole('button',{name:'Run AI Copilot',exact:true})).toHaveCount(0);await expect(page.getByText(/Could not load this ticket/).first()).toBeVisible();
 await page.goto('/tickets/'+state().ticketId);await expect(page.getByRole('heading',{name:'Password reset email',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Internal Notes',exact:true})).toHaveCount(0);
 await page.goto('/knowledge-base');await expect(page.getByRole('heading',{name:'Staff access required',exact:true})).toBeVisible();
});
