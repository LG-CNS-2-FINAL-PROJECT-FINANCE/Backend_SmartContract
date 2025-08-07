pipeline {
    agent {
        docker {
            image 'namsangwon/backend-smart-contract:latest'

            args '-v $HOME/.npm:/root/.npm'
        }
    }

    environment {
        SEPOLIA_RPC_URL = credentials('SEPOLIA_RPC_URL')
        PRIVATE_KEY_ADMIN = credentials('PRIVATE_KEY_ADMIN')
        
        CHAINLINK_FUNCTIONS_SUBSCRIPTIONS = credentials('CHAINLINK_FUNCTIONS_SUBSCRIPTIONS')
        SEPOLIA_FUNCTIONS_ROUTER = credentials('SEPOLIA_FUNCTIONS_ROUTER')
        SEPOLIA_DON_ID = credentials('SEPOLIA_DON_ID')
        SEPOLIA_LINK_ADDR = credentials('SEPOLIA_LINK_ADDR')

        GELATO_TRUSTED_FORWARDER = credentials('GELATO_TRUSTED_FORWARDER')
        ETHERSCAN_API_KEY = credentials('ETHERSCAN_API_KEY')

        INVESTMENT_API_URL = credentials('INVESTMENT_API_URL')
        TRADE_API_URL = credentials('TRADE_API_URL')
        DEPLOY_RESULT_API_URL = credentials('DEPLOY_RESULT_API_URL')
    }

    parameters {
        string(name: 'PROJECT_ID', description: 'Unique identifier for the product.')
        string(name: 'TOKEN_NAME', description: 'The name of the token.')
        string(name: 'TOKEN_SYMBOL', description: 'The symbol of the token.')
        string(name: 'TOTAL_GOAL_AMOUNT', description: 'The total investment goal.')
        string(name: 'MIN_AMOUNT', description: 'The minimum investment amount.')
    }

    def contractAddress = ""

    stages {
        stage('Test') {
            steps {
                echo 'Running tests...'

                withEnv(["PATH+=${env.WORKSPACE}/node_modules/.bin"]) {
                    sh 'npm run test'
                }
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    echo 'Deploying contract to Sepolia network...'

                    withEnv([
                        "TOKEN_NAME=${params.TOKEN_NAME}",
                        "TOKEN_SYMBOL=${params.TOKEN_SYMBOL}",
                        "TOTAL_GOAL_AMOUNT=${params.TOTAL_GOAL_AMOUNT}",
                        "MIN_AMOUNT=${params.MIN_AMOUNT}",
                        "SEPOLIA_RPC_URL=${env.SEPOLIA_RPC_URL}",
                        "PRIVATE_KEY_ADMIN=${env.PRIVATE_KEY_ADMIN}",
                        "CHAINLINK_FUNCTIONS_SUBSCRIPTIONS=${env.CHAINLINK_FUNCTIONS_SUBSCRIPTIONS}",
                        "SEPOLIA_FUNCTIONS_ROUTER=${env.SEPOLIA_FUNCTIONS_ROUTER}",
                        "SEPOLIA_DON_ID=${env.SEPOLIA_DON_ID}",
                        "GELATO_TRUSTED_FORWARDER=${env.GELATO_TRUSTED_FORWARDER}",
                        "ETHERSCAN_API_KEY=${env.ETHERSCAN_API_KEY}",
                        "INVESTMENT_API_URL=${env.INVESTMENT_API_URL}",
                        "TRADE_API_URL=${env.TRADE_API_URL}",
                        "DEPLOY_RESULT_API_URL=${env.DEPLOY_RESULT_API_URL}"
                    ]) {
                        withEnv(["PATH+=${env.WORKSPACE}/node_modules/.bin"]) {
                            def deployOutput = sh(returnStdout: true, script: "npm run deploy")
                            
                            contractAddress = (deployOutput =~ /FractionalInvestmentToken deployed to (0x[a-fA-F0-9]{40})/).collect { it[1] }[0]
                            
                            echo "Deployed contract address: ${contractAddress}"
                        }
                    }
                }
            }
        }
    }
    
    post {
        success {
            echo 'Deployment Pipeline Succeeded!'
                            
            sh """
                curl -X POST \\
                -H "Content-Type: application/json" \\
                -d '{
                        "productId":"${params.PRODUCT_ID}",
                        "address":"${contractAddress}",
                        "status":"success"
                    }' \\
                "${env.DEPLOY_RESULT_API_URL}"
            """
        }
        failure {
            echo 'Deployment Pipeline Failed!'
            
            sh """
                curl -X POST \\
                -H "Content-Type: application/json" \\
                -d '{
                        "productId":"${params.PRODUCT_ID}",
                        "address":"${contractAddress}",
                        "status":"failure"
                    }' \\
                "${env.DEPLOY_RESULT_API_URL}"
            """
        }
    }
}
