const defaultAvtar = [
    {
        location: 'odii_user_avatar1.png',
        origin: 'https://s3.ap-southeast-1.amazonaws.com/odii.asia/odii-default-avatar.jpg',
        host: 'https://i.odii.asia',
    },
]

exports.getRandomAvatar = () =>
    defaultAvtar[Math.floor(Math.random() * (defaultAvtar.length - 1))]
