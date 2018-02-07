const VERSION = 1;
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';

// Globals are used here because it's a single, simple script.
var start_data = {'fetched': false},
    menu_expanded = false,
    selecting_favorites = false,
    update_code = '';

function _qs(selector) { return document.querySelector(selector); }

// Edge forEach polyfill
if (!NodeList.prototype.forEach)
    NodeList.prototype.forEach = Array.prototype.forEach;

async function main() {
    _qs('#version').innerText = VERSION;
    clicked_button_width(0);
    _qs('#theme_' + (localStorage.getItem('theme') || 'dark')).checked = true;
    clicked_theme();

    // Check if data can be loaded
    var split = window.location.hash.replace('#', '').split(':');
    if (split.length == 2) {
        start_data.upload_channel_id = split[0];
        if (!await fetch_start_data(split[1]))
            return;
        if (!await check_session_validity())
            return;

        // Check for potential updates
        if (!await clicked_update_tags(true))
            return;

        load_tags();
        load_favorite_tags();
        _qs('#server_name').innerText = start_data.guild_name;
        _qs('#channel_name').innerText = start_data.channel_name;
        _qs('#voice_channel_name').innerText = start_data.voice_channel_name;
        document.title = "Tag Remote (" + start_data.guild_name + ")";
        close_message();
    } else {
        show_message('Invalid session. Open the link provided by the Discord bot instead.', true);
    }

}

async function clicked_update_tags(first_time = false) {
    if (!first_time) {
        if (!await check_session_validity(true))  // Get webhook name
            return false;
    }
    var webhook_name = start_data.hook_data.name;
    var new_code = webhook_name.slice(0, -1).split('[')[1];
    if (new_code !== update_code) {
        update_code = new_code;
    } else if (first_time) {  // Ignore no updates on startup
        return true;
    } else {
        show_message('No update available.', true, true);
        return false;
    }

    if (!await fetch_start_data(update_code, true))
        return false;

    if (!first_time) {
        load_tags();
        load_favorite_tags();
        _qs('#server_name').innerText = start_data.guild_name;
        _qs('#channel_name').innerText = start_data.channel_name;
        _qs('#voice_channel_name').innerText = start_data.voice_channel_name;
        document.title = "Tag Remote (" + start_data.guild_name + ")";
        close_message();
        clicked_menu(true);
    }
    return true;
}

async function fetch_start_data(snowflake, updating = false) {
    show_message('Please wait...\n' + (updating ? 'Fetching' : 'Updating') + ' session data');
    var data_url = (
        'https://cdn.discordapp.com/attachments/' +
        start_data.upload_channel_id + '/' + snowflake + '/remote_data');

    // Download session data
    var parsed, response;
    response = await fetch(CORS_PROXY + data_url);
    switch (response.status) {
        case 403:
            show_message('Invalid session code.', true);
            return false;
        case 200:
            break;
        default:
            show_message('Failed to download session data. Error:\n' + response.status, true);
            return false;
    }

    // Set start data
    parsed = await response.json();
    try {
        if (parsed) {
            [
                'version', 'bot_id',
                'guild', 'guild_name',
                'channel', 'channel_name',
                'voice_channel', 'voice_channel_name',
                'tags'
            ].forEach(it => start_data[it] = parsed[it]);
            start_data.hook_url = 'https://canary.discordapp.com/api/webhooks/' + parsed.webhook[0] + '/' + parsed.webhook[1];
            start_data.fetched = true;
            if (start_data.version !== VERSION) {
                show_message('Outdated version. Reload the page to try again.', true);
                return false;
            }
            return true;
        }
    } catch (e) {
        console.log(e);
        show_message('Failed to parse session data. Error:\n' + e.name, true);
        return false;
    }
    show_message('Session data is invalid. Please start a new session via the Discord bot.', true);
    return false;
}

async function check_session_validity() {
    show_message('Please wait...\nChecking session validity');
    try {
        var response = await fetch(start_data.hook_url);
        var parsed = await response.json();
        start_data.hook_data = parsed;
    } catch (e) {
        console.log(e);
        show_message('Failed to check session validity. Error:\n' + e.name, true);
        return false;
    }
    if (response.status == 404) {
        show_message('This session no longer exists. Please start a new one via the Discord bot.', true);
        return false;
    }
    if (response.status != 200) {
        show_message('Failed to check session validity. Please try again later.', true);
        return false;
    }
    return true;
}

function _sort_tag_list(tag_list) {
    var sort_strategy = localStorage.getItem('sort') || 'name';
    if (sort_strategy === 'name')  // Sort by name
        tag_list.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);  // SO: 5199901
    else  // Sort by hits
        tag_list.sort((a, b) => a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0);
}

function load_tags(highlight_favorited = false) {
    var tags_div = _qs('#tags');
    var tag_list = [];
    var favorited = JSON.parse(localStorage.getItem(start_data.guild + start_data.bot_id) || '[]');
    for (var key in start_data.tags)
        tag_list.push([key, start_data.tags[key].hits]);
    _sort_tag_list(tag_list);

    while (tags_div.firstChild)
        tags_div.removeChild(tags_div.lastChild);
    for (var it = 0; it < tag_list.length; it++ ) {
        var template_tag_button = _qs('#template_tag_button');
        var clone = template_tag_button.cloneNode(true);
        var key = tag_list[it][0];
        clone.removeAttribute('id');
        clone.dataset.key = key;
        clone.dataset.name = start_data.tags[key].name;
        clone.innerText = clone.dataset.name;
        if (highlight_favorited && favorited.includes(clone.dataset.key))
            clone.classList.add('favorite_outline');
        tags_div.appendChild(clone);
    }
}

function load_favorite_tags() {
    var favorites_div = _qs('#favorites');
    var tag_list = [];
    var used = [];
    var favorited = JSON.parse(localStorage.getItem(start_data.guild + start_data.bot_id) || '[]');
    for (var key in start_data.tags) {
        if (favorited.includes(key)) {
            used.push(key);
            tag_list.push([key, start_data.tags[key].hits]);
        }
    }
    localStorage.setItem(start_data.guild + start_data.bot_id, JSON.stringify(used));
    _sort_tag_list(tag_list);

    while (favorites_div.firstChild)
        favorites_div.removeChild(favorites_div.lastChild);
    for (var it = 0; it < tag_list.length; it++ ) {
        var template_tag_button = _qs('#template_tag_button');
        var clone = template_tag_button.cloneNode(true);
        var key = tag_list[it][0];
        clone.removeAttribute('id');
        clone.classList.add('favorited');
        clone.dataset.key = key;
        clone.dataset.name = start_data.tags[key].name;
        clone.innerText = clone.dataset.name;
        favorites_div.appendChild(clone);
    }
}

async function clicked_tag(tag) {
    if (selecting_favorites) {
        tag.classList.toggle('favorite_outline');
        var favorited = JSON.parse(localStorage.getItem(start_data.guild + start_data.bot_id) || '[]');
        var included = favorited.indexOf(tag.dataset.key);
        if (included > -1)
            favorited.splice(included, 1);
        else
            favorited.push(tag.dataset.key);
        localStorage.setItem(start_data.guild + start_data.bot_id, JSON.stringify(favorited));
    } else {
        var color = tag.classList.contains('favorited') ? 'favorited' : 'primary';
        tag.style.transition = 'initial';
        tag.style.border = '2px solid var(--fg-' + color + ')';
        window.setTimeout(() => {
            tag.style.transition = '0.25s cubic-bezier(0, 0.75, 0.25, 1)';
            tag.style.border = '2px solid var(--fg-' + color + '-transparent)';
        }, 50);
        await send_message('[Retrieve] ' + tag.dataset.name);
    }
}

async function clicked_stop_audio() {
    await send_message('[Stop audio]');
}

function clicked_button_width(delta) {
    var width = parseInt(localStorage.getItem('width') || 90) + delta;
    localStorage.setItem('width', width.toString());
    _qs('#button_width_value').innerText = width;
    document.body.style.setProperty('--button-width', width + 'px');
}

function clicked_theme() {
    var theme_values = [  // Defaults to dark
        'rgba(255, 255, 255, 1.0)',  // fg-primary
        'rgba(255, 255, 255, 0.0)',  // fg-primary-transparent
        'rgb(180, 180, 180)',        // fg-secondary
        'rgb(48, 48, 48)',           // bg-primary
        'rgb(68, 68, 68)',           // bg-secondary
        'rgba(255, 215, 0, 1.0)',    // fg-favorited
        'rgba(255, 215, 0, 0.0)'     // fg-favorited-transparent
    ];
    var selected = _qs('#theme_buttons input:checked').value;
    localStorage.setItem('theme', selected);
    if (selected === 'light') {
        theme_values = [
            'rgba(0, 0, 0, 1.0)',
            'rgba(0, 0, 0, 0.0)',
            'rgb(128, 128, 128)',
            'rgb(255, 255, 255)',
            'rgb(200, 200, 200)',
            'rgba(160, 135, 0, 1.0)',
            'rgba(160, 135, 0, 0.0)'
        ];
    } else if (selected === 'amoled') {
        theme_values = [
            'rgba(255, 255, 255, 1.0)',
            'rgba(255, 255, 255, 0.0)',
            'rgb(180, 180, 180)',
            'rgb(0, 0, 0)',
            'rgb(0, 0, 0)',
            'rgba(255, 215, 0, 1.0)',
            'rgba(255, 215, 0, 0.0)'
        ];
    }
    document.body.style.setProperty('--fg-primary', theme_values[0]);
    document.body.style.setProperty('--fg-primary-transparent', theme_values[1]);
    document.body.style.setProperty('--fg-secondary', theme_values[2]);
    document.body.style.setProperty('--bg-primary', theme_values[3]);
    document.body.style.setProperty('--bg-secondary', theme_values[4]);
    document.body.style.setProperty('--fg-favorited', theme_values[5]);
    document.body.style.setProperty('--fg-favorited-transparent', theme_values[6]);
}

function clicked_sortby() {
    var selected = _qs('#sortby_buttons input:checked').value;
    localStorage.setItem('sort', selected);
    load_tags();
    load_favorite_tags();
    clicked_menu(true);
}

function clicked_select_favorites() {
    load_tags(true);
    _qs('#favorites_hint').classList.remove('hidden');
    _qs('#favorites').classList.add('hidden');
    _qs('#menu_button').innerText = 'Done';
    selecting_favorites = true;
    clicked_menu(true);
}

function show_message(message, warn = false, button = false) {
    _qs('#notification_text').innerText = message;
    _qs('#notification_container').classList.remove('hidden');
    if (warn)
        _qs('#notification_warning').classList.remove('hidden');
    else
        _qs('#notification_warning').classList.add('hidden');
    if (button)
        _qs('#okay_button').classList.remove('hidden');
    else
        _qs('#okay_button').classList.add('hidden');
}

function close_message() {
    _qs('#notification_container').classList.add('hidden');
}

async function send_message(content) {
    var form = new FormData();
    form.append('content', content);
    var response = await fetch(start_data.hook_url, {
        method: 'POST',
        body: form
    });

    switch (response.status) {
        case 429:
            for (var it = 5; it > 0; it-- ) {
                show_message('Rate limit exceeded. Please wait...\n' + it, true);
                await new Promise(_ => setTimeout(_, 1000));
            }
            close_message();
            return false;
        case 404:
            show_message('The session has ended.', true);
            return false;
        case 204:
            break;
        default:
            console.log(response);
            show_message('Failed to submit data.\nStatus code ' + response.status, true);
            return false;
    }
}

function clicked_menu(always_close = false) {
    if (!always_close && selecting_favorites) {
        _qs('#menu_button').innerHTML = '&#8226;&#8226;&#8226;';
        _qs('#favorites_hint').classList.add('hidden');
        _qs('#favorites').classList.remove('hidden');
        load_tags();
        load_favorite_tags();

        selecting_favorites = false;
    } else {
        var header = _qs('#header');
        var shade = _qs('#header_shade');
        if (menu_expanded || always_close) {
            header.style.height = '40px';
            shade.style.opacity = '0';
            shade.style.pointerEvents = 'none';
        } else {
            var options_container = _qs('#options_container');
            var height = options_container.clientHeight;
            header.style.height = 40 + height + 'px';
            shade.style.opacity = '0.75';
            shade.style.pointerEvents = 'all';
        }
        menu_expanded = always_close ? false : !menu_expanded;
    }
}
