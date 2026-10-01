// Exercise the actual welcome/sign-in flow; never forge workspace permissions.
module.exports=async function workspace(page,mode){
 let scope=page;
 if(await page.getByRole('dialog').isVisible())scope=page.getByRole('dialog');
 else if(!await page.locator('.sidebar').isVisible()){
  await page.getByRole('button',{name:'More',exact:true}).click();scope=page.getByRole('dialog');
 }else scope=page.locator('.sidebar');
 const menu=scope.locator('.account-menu');
 if(await menu.getAttribute('open')===null)await menu.locator('summary').click();
 await menu.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByRole('heading',{name:'Welcome to Banking',exact:true}).waitFor();
 if(mode==='Demo')await page.getByRole('button',{name:'Try Demo',exact:false}).click();
 else{
  await page.getByRole('button',{name:'Sign in as Dan',exact:false}).click();
  await page.getByLabel('Password',{exact:true}).fill('Synthetic access fixture passphrase');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
 }
 await page.getByRole('heading',{name:'Cash balance',exact:true}).waitFor();
};
