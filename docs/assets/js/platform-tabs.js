const expensifyClassic = document.getElementById('platform-tab-expensify-classic');
const newExpensify = document.getElementById('platform-tab-new-expensify');

const expensifyClassicContent = document.getElementById('expensify-classic');
const newExpensifyContent = document.getElementById('new-expensify');

const platformTabs = document.getElementById('platform-tabs');

if (expensifyClassicContent) {
    const tab = document.createElement('div');
    tab.innerHTML = 'Expensify classic';
    tab.id = 'platform-tab-expensify-classic';
    tab.classList.add('active');
    platformTabs.appendChild(tab);
}

if (newExpensifyContent) {
    const tab = document.createElement('div');
    tab.innerHTML = 'New expensify';
    tab.id = 'platform-tab-new-expensify';

    if (!expensifyClassicContent) {
        tab.classList.add('active'); 
    }
    platformTabs.appendChild(tab);
}
