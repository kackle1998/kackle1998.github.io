particlesJS('particles-js', {
    particles: {
        number: {
            value: 36,
            density: {
                enable: true,
                value_area: 800
            }
        },
        color: {
            value: '#7b2cbf'
        },
        shape: {
            type: 'circle'
        },
        opacity: {
            value: 0.3,
            random: true
        },
        size: {
            value: 6,
            random: true
        },
        line_linked: {
            enable: false,
        },
        move: {
            enable: true,
            speed: 1.65,
            direction: 'none',
            random: true,
            straight: false,
            out_mode: 'out',
            bounce: false
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


