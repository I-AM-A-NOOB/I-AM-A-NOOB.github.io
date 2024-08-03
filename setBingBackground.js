document.addEventListener('DOMContentLoaded', function () {
    fetch('https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN')
        .then(response => response.json())
        .then(data => {
            const imageUrl = 'https://cn.bing.com' + data.images[0].url;
            document.body.style.backgroundImage = `url(${imageUrl})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundRepeat = 'no-repeat';
        })
        .catch(error => console.error('Error fetching Bing wallpaper:', error));
});