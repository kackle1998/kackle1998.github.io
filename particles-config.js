particlesJS('particles-js', {
    particles: {
        number: {
            value: 33,
            density: {
                enable: true,
                value_area: 800
            }
        },
        color: {
            value: '#2d5a5e'
        },
        shape: {
            type: 'circle'
        },
        opacity: {
            value: 0.35,
            random: true
        },
        size: {
            value: 8,
            random: true
        },
        line_linked: {
            enable: false,
        },
        move: {
            enable: true,
            speed: 1.9,
            direction: 'none',
            random: true,
            straight: false,
            out_mode: 'out',
            bounce: true
        }
    },
    interactivity: {
        detect_on: 'canvas',
        events: {
            onhover: {
                enable: false
            },
            onclick: {
                enable: false
            },
            resize: true
        }
    },
    retina_detect: true
});




